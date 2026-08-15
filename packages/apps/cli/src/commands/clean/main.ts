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
} from '@lumpcode/core';

import { shellBestEffort } from '../../utils/shellBestEffort';

import { globalConfigFolderPath as defaultGlobalConfigFolderPath } from '../../constants';
import { REFS_HEADS_PREFIX, LUMP_BRANCH_PREFIX } from '../../consts';
import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import { commandFailure } from '../../utils/commandFailure';
import { getExecutionWorkspacePath } from '../../utils/getExecutionWorkspacePath';
import { getGitCommitMessage } from '../../utils/getGitCommitMessage';
import { lumpWorktreePath } from '../../utils/getLumpWorktreePath';
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

async function discoverByContext(projectRoot: string, lumpName: string, contextName: string): Promise<DiscoveredRefs> {
    const commitMessage = getGitCommitMessage({ contextName, lumpName });

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
        if (remoteResult.success) {
            for (const b of parseLocalRefs(remoteResult.data.stdout)) {
                if (b.startsWith(`origin/${LUMP_BRANCH_PREFIX}`)) {
                    remoteBranchSet.add(b.slice('origin/'.length));
                }
            }
        }
        if (localResult.success) {
            for (const b of parseLocalRefs(localResult.data.stdout)) {
                if (b.startsWith(LUMP_BRANCH_PREFIX)) {
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

async function deleteRefs(executionWorkspacePath: string, refs: DiscoveredRefs): Promise<void> {
    const { remoteBranches, localBranches } = refs;
    const allBranches = [...new Set([...remoteBranches, ...localBranches])];

    await removeWorktreesForBranches(executionWorkspacePath, allBranches);

    if (remoteBranches.length > 0) {
        const remoteRefs = remoteBranches.map(b => `${REFS_HEADS_PREFIX}${b}`);
        await execAsync(`git push --delete origin ${remoteRefs.join(' ')}`, { cwd: executionWorkspacePath });
    }
    if (localBranches.length > 0) {
        await execAsync(`git branch -D ${localBranches.join(' ')}`, { cwd: executionWorkspacePath });
    }
}

const handlerMaker: CommandHandlerMaker<Injections, Input, Output> = (injections) => async (input) => {
    const { projectRoot } = injections;
    const globalConfigFolderPath = injections.globalConfigFolderPath ?? defaultGlobalConfigFolderPath;
    const { lumpName, contextName } = input.options;

    const validationResult = await validateCurrentLumpProjectRoot({ cwd: projectRoot });
    
    if (!validationResult.success) return commandFailure(validationResult.data);

    if (contextName && !lumpName) {
        return failure({ messages: ['--contextName requires --lumpName to be set'] });
    }

    const localConfigDir = localConfigFolderPath({ projectRoot });
    const localConfigResult = await readProjectLocalConfig({ localConfigFolderPath: localConfigDir });
    if (!localConfigResult.success) return commandFailure(localConfigResult.data);

    const executionWorkspaces: string[] = [path.resolve(projectRoot)];
    if (localConfigResult.data.mode === 'shared') {
        const copyPath = getExecutionWorkspacePath({
            mode: 'shared',
            sourceProjectRoot: projectRoot,
            globalConfigFolderPath,
            projectName: localConfigResult.data.projectName,
        });
        try {
            const stat = await fs.stat(copyPath);
            if (stat.isDirectory()) {
                executionWorkspaces.push(path.resolve(copyPath));
            }
        } catch {
            // no shared copy at this path
        }
    }

    const uniqueExecutionWorkspaces = [...new Set(executionWorkspaces)];
    const allBranches = new Set<string>();

    for (const executionWorkspacePath of uniqueExecutionWorkspaces) {
        await execAsync('git fetch --all', { cwd: executionWorkspacePath });

        const refs = contextName && lumpName
            ? await discoverByContext(executionWorkspacePath, lumpName, contextName)
            : await discoverByGlob(
                executionWorkspacePath,
                lumpBranchGlob({ lumpName }),
            );

        await deleteRefs(executionWorkspacePath, refs);
        for (const branch of [...refs.remoteBranches, ...refs.localBranches]) {
            allBranches.add(branch);
        }
    }

    const deletedBranches = [...allBranches];

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
