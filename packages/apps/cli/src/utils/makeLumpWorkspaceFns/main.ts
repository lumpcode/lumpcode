import * as path from 'node:path';

import { shellBestEffort, shellSingleQuote } from '@lumpcode/core';
import type { SetupWorkspaceFn, TeardownWorkspaceFn } from '@lumpcode/core';

import type { WorkspaceStrategy } from '../../types/WorkspaceStrategy';
import { atDirectory } from '../atDirectory';
import { lumpWorktreePath } from '../getLumpWorktreePath';

export interface MakeLumpWorkspaceFnsInput {
    /** Execution workspace (absolute): git repo root — project copy in shared mode, checkout in dedicated. */
    executionWorkspacePath: string;
    /**
     * Project-wide base branch declared in `.lumpcode/local.json`. Used for setup
     * switch-back when no per-lump override is provided.
     */
    projectBaseBranch: string;
    /**
     * Lump resolved integration branch. Teardown switches back to this branch
     * when set (may differ from `projectBaseBranch`).
     */
    lumpBaseBranch?: string;
    workspaceStrategy: WorkspaceStrategy;
}

export interface MakeLumpWorkspaceFnsOutput {
    setupWorkspaceFn: SetupWorkspaceFn;
    teardownWorkspaceFn: TeardownWorkspaceFn;
}

/**
 * Builds the per-lump setup/teardown that the engine runs around a single lump
 * execution. Pre-flight has already pulled `projectBaseBranch` and resolved
 * `executionWorkspacePath`; here we prepare the lump branch (checkout or worktree)
 * and teardown back to a known state.
 *
 * Checkout and worktree setup/teardown prefix with `cd` into `executionWorkspacePath`
 * (via `atDirectory`) so cmd.exe gets an explicit `cd /d` on Windows. The engine
 * runs the shell string at source `projectRoot`.
 */
export function makeLumpWorkspaceFns(input: MakeLumpWorkspaceFnsInput): MakeLumpWorkspaceFnsOutput {
    const { executionWorkspacePath, projectBaseBranch, workspaceStrategy } = input;
    const resolvedExecutionWorkspace = path.resolve(executionWorkspacePath); // TODO : why need path.resolve ?

    if (workspaceStrategy === 'worktree') {
        return makeWorktreeWorkspaceFns({ executionWorkspacePath: resolvedExecutionWorkspace, projectBaseBranch });
    }

    return makeCheckoutWorkspaceFns({ executionWorkspacePath: resolvedExecutionWorkspace, projectBaseBranch });
}

function makeCheckoutWorkspaceFns({
    executionWorkspacePath,
    projectBaseBranch,
}: {
    executionWorkspacePath: string;
    projectBaseBranch: string;
}): MakeLumpWorkspaceFnsOutput {
    const setupWorkspaceFn: SetupWorkspaceFn = async ({ baseBranch, branchName }) => {
        const quotedBranch = shellSingleQuote(branchName);
        const gitBody = [
            `git fetch origin ${baseBranch}`,
            `git switch ${baseBranch}`,
            `git reset --hard origin/${baseBranch}`,
            `git pull origin ${baseBranch}`,
            shellBestEffort(`git branch -D ${quotedBranch}`),
            `git switch -c ${quotedBranch}`,
        ].join(' && ');

        const branchWorkspacePath = executionWorkspacePath;

        return {
            command: atDirectory(executionWorkspacePath, gitBody),
            workspacePath: branchWorkspacePath,
        };
    };

    const teardownWorkspaceFn: TeardownWorkspaceFn = async () => {
        return atDirectory(executionWorkspacePath, `git switch ${projectBaseBranch}`);
    };

    return { setupWorkspaceFn, teardownWorkspaceFn };
}

function makeWorktreeWorkspaceFns({
    executionWorkspacePath,
    projectBaseBranch,
}: {
    executionWorkspacePath: string;
    projectBaseBranch: string;
}): MakeLumpWorkspaceFnsOutput {
    const setupWorkspaceFn: SetupWorkspaceFn = async ({ baseBranch, branchName }) => {
        const branchWorkspacePath = lumpWorktreePath({ executionWorkspacePath, branchName });
        const quotedWorktree = shellSingleQuote(branchWorkspacePath);
        const quotedBranch = shellSingleQuote(branchName);
        const quotedOriginBase = shellSingleQuote(`origin/${baseBranch}`);

        const gitBody = [
            `git fetch origin ${baseBranch}`,
            `git switch ${projectBaseBranch}`,
            shellBestEffort(`git worktree remove --force ${quotedWorktree}`),
            shellRemoveDirectory(quotedWorktree),
            shellBestEffort(`git branch -D ${quotedBranch}`),
            shellBestEffort(shellEnsureDirectory(path.dirname(branchWorkspacePath))),
            `git worktree add -B ${quotedBranch} ${quotedWorktree} ${quotedOriginBase}`,
        ].join(' && ');

        return {
            command: atDirectory(executionWorkspacePath, gitBody),
            workspacePath: branchWorkspacePath,
        };
    };

    const teardownWorkspaceFn: TeardownWorkspaceFn = async ({ branchName }) => {
        const quotedWorktree = shellSingleQuote(
            lumpWorktreePath({ executionWorkspacePath, branchName }),
        );
        return atDirectory(
            executionWorkspacePath,
            shellBestEffort(`git worktree remove --force ${quotedWorktree}`),
        );
    };

    return { setupWorkspaceFn, teardownWorkspaceFn };
}

/** Best-effort removal of a quoted directory path for execAsync (cmd.exe on Windows). */
function shellRemoveDirectory(quotedPath: string): string {
    if (process.platform === 'win32') {
        return shellBestEffort(`if exist ${quotedPath} rmdir /s /q ${quotedPath}`);
    }
    return shellBestEffort(`rm -rf ${quotedPath}`);
}

/** Creates parent dirs before `git worktree add` (best-effort so a stale path does not block add). */
function shellEnsureDirectory(absolutePath: string): string {
    const quoted = shellSingleQuote(absolutePath);
    if (process.platform === 'win32') {
        return `if not exist ${quoted} mkdir ${quoted}`;
    }
    return `mkdir -p ${quoted}`;
}
