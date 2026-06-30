import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { execAsync, failure, type Failure, shellSingleQuote, success, type Success } from '@lumpcode/core';

import type { Mode } from '../../types/Mode';
import { getExecutionWorkspacePath } from '../getExecutionWorkspacePath';
import { projectCopiesRootPath } from '../projectCopiesRootPath';
export interface RunPreflightInput {
    mode: Mode;
    projectBaseBranch: string;
    /** Absolute path to the directory that contains `.lumpcode/` (and `.git/`). */
    sourceProjectRoot: string;
    /** Used for `<globalConfigFolderPath>/project-copies/<projectName>` in `shared` mode. */
    globalConfigFolderPath: string;
    projectName: string;
}

export interface RunPreflightOutput {
    /**
     * Absolute path to the execution workspace (git repo root where lumps run).
     * Equal to `sourceProjectRoot` in `dedicated` mode; the project copy in `shared` mode.
     */
    executionWorkspacePath: string;
}

/**
 * Prepares the execution workspace before a lump is run. In `shared` mode, ensures a
 * project copy exists under `<globalConfigFolderPath>/project-copies/<projectName>`,
 * and when reusing an existing copy, aligns its `origin` URL with the source clone
 * if they differ; then pulls `projectBaseBranch` inside the copy. The source clone
 * is never touched.
 * In `dedicated` mode, pulls `projectBaseBranch` in `sourceProjectRoot` in
 * place (destructive: `git reset --hard origin/<projectBaseBranch>` wipes any
 * uncommitted work).
 *
 * The recovery path for crashed lumps relies on this pre-flight: a lump that
 * dies mid-run leaves the workspace on its branch, and the next pre-flight
 * resets back to `projectBaseBranch`. Keep the reset destructive.
 */
export async function runPreflight(input: RunPreflightInput): Promise<Success<RunPreflightOutput> | Failure<string>> {
    const { mode, projectBaseBranch, sourceProjectRoot, globalConfigFolderPath, projectName } = input;

    let executionWorkspacePath: string;
    if (mode === 'shared') {
        const copyResult = await ensureProjectCopy({ sourceProjectRoot, globalConfigFolderPath, projectName });
        if (!copyResult.success) return copyResult;
        executionWorkspacePath = copyResult.data.copyPath;

        if (copyResult.data.reused) {
            const syncOriginResult = await syncReusedCopyOriginRemote({
                sourceProjectRoot,
                copyPath: executionWorkspacePath,
            });
            if (!syncOriginResult.success) return syncOriginResult;
        }
    } else {
        executionWorkspacePath = sourceProjectRoot;
    }

    const pullResult = await pullProjectBaseBranch({ executionWorkspacePath, projectBaseBranch });
    if (!pullResult.success) return pullResult;

    return success({ executionWorkspacePath });
}

async function ensureProjectCopy({
    sourceProjectRoot,
    globalConfigFolderPath,
    projectName,
}: {
    sourceProjectRoot: string;
    globalConfigFolderPath: string;
    projectName: string;
}): Promise<Success<{ copyPath: string; reused: boolean }> | Failure<string>> {
    const copiesRoot = projectCopiesRootPath({ globalConfigFolderPath });
    const copyPath = getExecutionWorkspacePath({
        mode: 'shared',
        sourceProjectRoot,
        globalConfigFolderPath,
        projectName,
    });

    await fs.mkdir(copiesRoot, { recursive: true });

    let stat: Awaited<ReturnType<typeof fs.stat>> | null = null;
    try {
        stat = await fs.stat(copyPath);
    } catch {
        stat = null;
    }

    if (!stat) {
        try {
            await fs.cp(sourceProjectRoot, copyPath, { recursive: true });
        } catch (error) {
            return failure(`Failed to create project copy at ${copyPath}: ${String(error)}`);
        }
        return success({ copyPath: path.resolve(copyPath), reused: false });
    }

    if (!stat.isDirectory()) {
        return failure(`Project copy path exists but is not a directory: ${copyPath}`);
    }

    return success({ copyPath: path.resolve(copyPath), reused: true });
}

/** Reused copies can retain a stale `origin` if the source remote changed after the copy was created. */
async function syncReusedCopyOriginRemote({
    sourceProjectRoot,
    copyPath,
}: {
    sourceProjectRoot: string;
    copyPath: string;
}): Promise<Success<void> | Failure<string>> {
    const readOrigin = (cwd: string) => execAsync('git remote get-url origin', { cwd });

    const sourceUrlResult = await readOrigin(sourceProjectRoot);
    if (!sourceUrlResult.success) {
        return failure(`Failed to read origin URL from source project: ${sourceUrlResult.data.message}`);
    }

    const sourceOriginUrl = sourceUrlResult.data.stdout.trim();
    const copyUrlResult = await readOrigin(copyPath);
    if (copyUrlResult.success && copyUrlResult.data.stdout.trim() === sourceOriginUrl) {
        return success(undefined);
    }

    const quotedOriginUrl = shellSingleQuote(sourceOriginUrl);
    const syncCommand = copyUrlResult.success
        ? `git remote set-url origin ${quotedOriginUrl}`
        : `git remote add origin ${quotedOriginUrl}`;
    const syncResult = await execAsync(syncCommand, { cwd: copyPath });
    if (!syncResult.success) {
        return failure(`Failed to sync origin URL in project copy: ${syncResult.data.message}`);
    }

    return success(undefined);
}

async function pullProjectBaseBranch({
    executionWorkspacePath,
    projectBaseBranch,
}: {
    executionWorkspacePath: string;
    projectBaseBranch: string;
}): Promise<Success<void> | Failure<string>> {
    const quotedOriginRef = shellSingleQuote(`origin/${projectBaseBranch}`);
    const quotedBranch = shellSingleQuote(projectBaseBranch);
    const commands = [
        'git fetch --all',
        `git switch ${quotedBranch}`,
        `git reset --hard ${quotedOriginRef}`,
        `git pull origin ${quotedBranch}`,
    ];

    for (const command of commands) {
        const result = await execAsync(command, { cwd: executionWorkspacePath });
        if (!result.success) {
            return failure(
                `Pre-flight failed while running "${command}" in ${executionWorkspacePath}: ${result.data.message}`,
            );
        }
    }

    return success(undefined);
}
