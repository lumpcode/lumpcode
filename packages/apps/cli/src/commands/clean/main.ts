import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as z from 'zod';

import {
    commitMessageIncludesMarker,
    execAsync,
    failure,
    GIT_LOG_HASH_BODY_FORMAT,
    parseGitLogHashBodyRecords,
    shellSingleQuote,
    success,
    type ExecAsyncFailure,
} from '@lumpcode/core';

import { shellBestEffort } from '../../utils/shellBestEffort';

import { LUMP_BRANCH_PREFIX } from '../../consts';
import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import { commandFailure } from '../../utils/commandFailure';
import { getGitCommitMessage } from '../../utils/getGitCommitMessage';
import { lumpWorktreePath } from '../../utils/getLumpWorktreePath';
import { isNonLumpRemoteTrackingRef } from '../../utils/isReachableFromNonLumpRemoteHead';
import { listRemoteHeadBranches } from '../../utils/listRemoteHeadBranches';
import { localConfigFolderPath } from '../../utils/localConfigFolderPath';
import { lumpBranchGlob } from '../../utils/lumpBranchGlob';
import { readProjectLocalConfig } from '../../utils/readProjectLocalConfig';
import { validateCurrentLumpProjectRoot } from '../../utils/validateCurrentLumpProjectRoot';

const inputSchema = z.object({
    options: baseCommandOptionsSchema.extend({
        lumpName: z.string().optional().describe('Scope cleanup to a single lump'),
        contextName: z.string().optional().describe('Scope cleanup to a single context (requires lumpName)'),
    }),
    arguments: z.object({}),
});

export type Input = z.infer<typeof inputSchema>;

export type Output = {
    messages: string[];
    data?: { deletedBranches: string[] };
};

export interface Injections {
    projectRoot: string;
    globalConfigFolderPath?: string;
}

function parseLocalRefs(stdout: string): string[] {
    return stdout.trim().split("\n").filter(Boolean).map(s => s.trim());
}

async function discoverLocalBranches(projectRoot: string, branchPattern: string): Promise<string[]> {
    const result = await execAsync(
        `git branch --list ${shellSingleQuote(branchPattern)} --format=${shellSingleQuote('%(refname:short)')}`,
        { cwd: projectRoot },
    );
    if (!result.success) return [];
    return parseLocalRefs(result.data.stdout);
}

interface DiscoveredRefs {
    remoteBranches: string[];
    localBranches: string[];
}

async function discoverByGlob(projectRoot: string, branchPattern: string): Promise<DiscoveredRefs> {
    const [remoteListed, localBranches] = await Promise.all([
        listRemoteHeadBranches({
            cwd: projectRoot,
            branchGlob: branchPattern,
            postFilterBranchShortName: (shortName) => shortName.startsWith(LUMP_BRANCH_PREFIX),
        }),
        discoverLocalBranches(projectRoot, branchPattern),
    ]);
    return {
        remoteBranches: remoteListed.success ? remoteListed.data : [],
        localBranches,
    };
}

/** `lump/<lumpName>/` from `lumpBranchGlob`, so `lump/other` is not a candidate. */
function lumpNameBranchPrefix(lumpName: string): string {
    const glob = lumpBranchGlob({ lumpName });
    return glob.endsWith('*') ? glob.slice(0, -1) : glob;
}

async function discoverByContext(projectRoot: string, lumpName: string, contextName: string): Promise<DiscoveredRefs> {
    const commitMessage = getGitCommitMessage({ contextName, lumpName });
    const branchPrefix = lumpNameBranchPrefix(lumpName);

    const logResult = await execAsync(
        `git log --remotes=origin --branches -F --grep=${shellSingleQuote(commitMessage)} --format=${shellSingleQuote(GIT_LOG_HASH_BODY_FORMAT)}`,
        { cwd: projectRoot },
    );
    if (!logResult.success) {
        return { remoteBranches: [], localBranches: [] };
    }

    const matchingHashes = parseGitLogHashBodyRecords(logResult.data.stdout)
        .filter((entry) => commitMessageIncludesMarker(entry.message, commitMessage))
        .map((entry) => entry.hash);

    const remoteBranchSet = new Set<string>();
    const localBranchSet = new Set<string>();

    for (const hash of matchingHashes) {
        const [remoteResult, localResult] = await Promise.all([
            execAsync(`git branch -r --contains ${hash} --format=${shellSingleQuote('%(refname:short)')}`, { cwd: projectRoot }),
            execAsync(`git branch --contains ${hash} --format=${shellSingleQuote('%(refname:short)')}`, { cwd: projectRoot }),
        ]);
        const remoteRefs = remoteResult.success ? parseLocalRefs(remoteResult.data.stdout) : [];
        // Reachable from a non-lump remote head means the marker arrived through the base, not this branch.
        if (remoteRefs.some(isNonLumpRemoteTrackingRef)) continue;

        for (const b of remoteRefs) {
            if (b.startsWith(`origin/${branchPrefix}`)) {
                remoteBranchSet.add(b.slice('origin/'.length));
            }
        }
        if (localResult.success) {
            for (const b of parseLocalRefs(localResult.data.stdout)) {
                if (b.startsWith(branchPrefix)) {
                    localBranchSet.add(b);
                }
            }
        }
    }

    return {
        remoteBranches: [...remoteBranchSet],
        localBranches: [...localBranchSet],
    };
}

async function removeWorktreesForBranches(executionWorkspacePath: string, branchNames: string[]): Promise<void> {
    const resolvedExecutionWorkspace = path.resolve(executionWorkspacePath);
    for (const branchName of branchNames) {
        if (!branchName.startsWith(LUMP_BRANCH_PREFIX)) continue;
        let absWorktreePath: string;
        try {
            absWorktreePath = lumpWorktreePath({ executionWorkspacePath: resolvedExecutionWorkspace, branchName });
        } catch {
            continue;
        }
        const quotedWorktree = shellSingleQuote(absWorktreePath);
        await execAsync(
            shellBestEffort(`git worktree remove --force ${quotedWorktree}`),
            { cwd: resolvedExecutionWorkspace },
        );
        try {
            await fs.rm(absWorktreePath, { recursive: true, force: true });
        } catch {
            // best-effort
        }
    }
}

type DeleteSide = 'origin' | 'local';

type RefDeleteResult =
    | { branch: string; side: DeleteSide; ok: true }
    | { branch: string; side: DeleteSide; ok: false; error: string };

/** Git's own stderr from an `execAsync` failure, trimmed. */
function gitDeleteError(execFailure: ExecAsyncFailure): string {
    const raw = execFailure.info.stderr;
    if (typeof raw === 'object' && raw !== null && 'stderr' in raw) {
        const stderr = String((raw as { stderr?: unknown }).stderr ?? '').trim();
        if (stderr.length > 0) return stderr;
    }
    return execFailure.message.trim();
}

async function deleteOneRef(input: {
    cwd: string;
    branch: string;
    side: DeleteSide;
}): Promise<RefDeleteResult> {
    const { cwd, branch, side } = input;
    const command = side === 'origin'
        ? `git push --delete origin ${shellSingleQuote(branch)}`
        : `git branch -D ${shellSingleQuote(branch)}`;
    const result = await execAsync(command, { cwd });
    if (result.success) {
        return { branch, side, ok: true };
    }
    return { branch, side, ok: false, error: gitDeleteError(result.data) };
}

/**
 * Deletes one ref per command. A batched `git push --delete` or `git branch -D`
 * can remove some refs and still exit non-zero, which hides which branch failed.
 */
async function deleteRefs(executionWorkspacePath: string, refs: DiscoveredRefs): Promise<RefDeleteResult[]> {
    const remoteBranches = [...new Set(refs.remoteBranches)];
    const localBranches = [...new Set(refs.localBranches)];
    const allBranches = [...new Set([...remoteBranches, ...localBranches])];

    await removeWorktreesForBranches(executionWorkspacePath, allBranches);

    const results: RefDeleteResult[] = [];
    for (const branch of remoteBranches) {
        results.push(await deleteOneRef({ cwd: executionWorkspacePath, branch, side: 'origin' }));
    }
    for (const branch of localBranches) {
        results.push(await deleteOneRef({ cwd: executionWorkspacePath, branch, side: 'local' }));
    }
    return results;
}

/** A branch is deleted only when every copy `clean` targeted was removed. */
function deletedBranchNames(refs: DiscoveredRefs, results: RefDeleteResult[]): string[] {
    const ordered = [...new Set([...refs.remoteBranches, ...refs.localBranches])];
    return ordered.filter((branch) => {
        const attempts = results.filter((result) => result.branch === branch);
        return attempts.length > 0 && attempts.every((result) => result.ok);
    });
}

function isDeleteFailure(result: RefDeleteResult): result is Extract<RefDeleteResult, { ok: false }> {
    return !result.ok;
}

function formatDeleteFailure(result: Extract<RefDeleteResult, { ok: false }>): string {
    return `Could not delete ${result.side} branch "${result.branch}": ${result.error}`;
}

const handlerMaker: CommandHandlerMaker<Injections, Input, Output> = (injections) => async (input) => {
    const { projectRoot } = injections;
    const { lumpName, contextName } = input.options;

    const validationResult = await validateCurrentLumpProjectRoot({ cwd: projectRoot });
    
    if (!validationResult.success) return commandFailure(validationResult.data);

    if (contextName && !lumpName) {
        return failure({ messages: ['--contextName requires --lumpName to be set'] });
    }

    const localConfigDir = localConfigFolderPath({ projectRoot });
    const localConfigResult = await readProjectLocalConfig({ localConfigFolderPath: localConfigDir });
    if (!localConfigResult.success) return commandFailure(localConfigResult.data);

    const executionWorkspacePath = path.resolve(projectRoot);
    await execAsync('git fetch --all', { cwd: executionWorkspacePath });

    const refs = contextName && lumpName
        ? await discoverByContext(executionWorkspacePath, lumpName, contextName)
        : await discoverByGlob(
            executionWorkspacePath,
            lumpBranchGlob({ lumpName }),
        );

    const deleteResults = await deleteRefs(executionWorkspacePath, refs);
    const deletedBranches = deletedBranchNames(refs, deleteResults);
    const failures = deleteResults.filter(isDeleteFailure);

    if (failures.length > 0) {
        const failedBranchCount = new Set(failures.map((result) => result.branch)).size;
        return failure({
            messages: [
                ...failures.map(formatDeleteFailure),
                `Cleaned ${deletedBranches.length} branch(es); ${failedBranchCount} could not be deleted.`,
            ],
            data: { deletedBranches },
        });
    }

    return success({
        messages: [`Cleaned ${deletedBranches.length} branch(es)`],
        data: { deletedBranches },
    });
};

export const command = {
    handlerMaker,
    name: 'clean',
    description: 'Delete locally and on the remote all branches created by lump',
    inputSchema,
} satisfies Command;
