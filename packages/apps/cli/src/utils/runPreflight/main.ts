import { execAsync, failure, type Failure, shellSingleQuote, success, type Success } from '@lumpcode/core';

import { DISCOVERY_GIT_TIMEOUT_MS } from '../../consts';
import type { Mode } from '../../types/Mode';
import {
    type GitCommonDirLockContext,
    withGitCommonDirLock,
} from '../gitCommonDirLock';

export type RunPreflightGitLock = Omit<GitCommonDirLockContext, 'gitCwd'>;

export interface RunPreflightInput {
    mode: Mode;
    projectBaseBranch: string;
    /** Absolute path to the directory that contains `.lumpcode/` (and `.git/`). */
    sourceProjectRoot: string;
    globalConfigFolderPath: string;
    projectName: string;
    /**
     * When set, preflight git mutations run under the git-common-dir lock.
     * `gitCwd` is set to the execution workspace.
     */
    gitLock?: RunPreflightGitLock;
}

export interface RunPreflightOutput {
    /**
     * Absolute path to the execution workspace (git repo root where lumps run).
     * Equal to `sourceProjectRoot` in both modes. Shared `run` does not call this.
     */
    executionWorkspacePath: string;
}

/**
 * Prepares the execution workspace before a dedicated lump is run.
 * Shared mode returns `sourceProjectRoot` with no copy and no git reset
 * (shared `run` skips this helper entirely).
 * In `dedicated` mode, resets `projectBaseBranch` in `sourceProjectRoot` in
 * place (destructive: `git reset --hard origin/<projectBaseBranch>` wipes any
 * uncommitted work).
 *
 * The recovery path for crashed lumps relies on this pre-flight: a lump that
 * dies mid-run leaves the workspace on its branch, and the next pre-flight
 * resets back to `projectBaseBranch`. Keep the reset destructive.
 */
export async function runPreflight(input: RunPreflightInput): Promise<Success<RunPreflightOutput> | Failure<string>> {
    const { mode, projectBaseBranch, sourceProjectRoot, gitLock } = input;
    const executionWorkspacePath = sourceProjectRoot;

    if (mode === 'shared') {
        return success({ executionWorkspacePath });
    }

    const pullResult = await resetProjectBaseBranch({
        executionWorkspacePath,
        projectBaseBranch,
        gitLock,
    });
    if (!pullResult.success) return pullResult;

    return success({ executionWorkspacePath });
}

async function resetProjectBaseBranch({
    executionWorkspacePath,
    projectBaseBranch,
    gitLock,
}: {
    executionWorkspacePath: string;
    projectBaseBranch: string;
    gitLock?: RunPreflightGitLock;
}): Promise<Success<void> | Failure<string>> {
    const quotedOriginRef = shellSingleQuote(`origin/${projectBaseBranch}`);
    const quotedBranch = shellSingleQuote(projectBaseBranch);
    const commands = [
        `git fetch --no-write-fetch-head origin ${quotedBranch}`,
        `git switch ${quotedBranch}`,
        `git reset --hard ${quotedOriginRef}`,
    ];

    const runCommands = async (): Promise<Success<void> | Failure<string>> => {
        for (const command of commands) {
            const result = await execAsync(command, {
                cwd: executionWorkspacePath,
                timeoutMillis: DISCOVERY_GIT_TIMEOUT_MS,
            });
            if (!result.success) {
                return failure(
                    `Pre-flight failed while running "${command}" in ${executionWorkspacePath}: ${result.data.message}`,
                );
            }
        }
        return success(undefined);
    };

    if (!gitLock) {
        return runCommands();
    }

    const locked = await withGitCommonDirLock({
        lock: {
            ...gitLock,
            gitCwd: executionWorkspacePath,
        },
        fn: runCommands,
    });
    if (!locked.success) {
        return failure(typeof locked.data === 'string' ? locked.data : locked.data.message);
    }
    return locked.data;
}
