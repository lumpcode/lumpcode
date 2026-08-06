import * as path from 'node:path';

import { execAsync, shellSingleQuote } from '@lumpcode/core';
import type {
    SetupWorkspaceFn,
    TeardownWorkspaceFn,
} from '@lumpcode/core';

import type { WorkspaceStrategy } from '../../types/WorkspaceStrategy';
import { atDirectory } from '../atDirectory';
import {
    type GitCommonDirLockContext,
    withGitCommonDirLock,
} from '../gitCommonDirLock';
import { lumpWorktreePath } from '../getLumpWorktreePath';
import { shellBestEffort } from '../shellBestEffort';

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
    /**
     * When set, setup/teardown run git under the common-dir lock and return an
     * empty command string for the engine (work already done).
     */
    gitLock?: GitCommonDirLockContext;
}

export interface MakeLumpWorkspaceFnsOutput {
    setupWorkspaceFn: SetupWorkspaceFn;
    teardownWorkspaceFn: TeardownWorkspaceFn;
}

/**
 * Builds the per-lump setup/teardown that the engine runs around a single lump
 * execution. Pre-flight has already reset `projectBaseBranch` and resolved
 * `executionWorkspacePath`; here we prepare the lump branch (checkout or worktree)
 * and teardown back to a known state.
 *
 * When `gitLock` is provided, git runs inside the fn under that lock and the
 * engine receives an empty command. Otherwise a compound shell string is returned
 * (tests / callers without a lock context).
 */
export function makeLumpWorkspaceFns(input: MakeLumpWorkspaceFnsInput): MakeLumpWorkspaceFnsOutput {
    const { executionWorkspacePath, projectBaseBranch, lumpBaseBranch, workspaceStrategy, gitLock } =
        input;
    const resolvedExecutionWorkspace = path.resolve(executionWorkspacePath);
    const switchBackBranch = lumpBaseBranch ?? projectBaseBranch;

    if (workspaceStrategy === 'worktree') {
        return makeWorktreeWorkspaceFns({
            executionWorkspacePath: resolvedExecutionWorkspace,
            switchBackBranch,
            gitLock,
        });
    }

    return makeCheckoutWorkspaceFns({
        executionWorkspacePath: resolvedExecutionWorkspace,
        switchBackBranch,
        gitLock,
    });
}

async function runGitBodyUnderLock(input: {
    executionWorkspacePath: string;
    gitBody: string;
    gitLock: GitCommonDirLockContext;
}): Promise<void> {
    const { executionWorkspacePath, gitBody, gitLock } = input;
    const command = atDirectory(executionWorkspacePath, gitBody);
    const locked = await withGitCommonDirLock({
        lock: { ...gitLock, gitCwd: executionWorkspacePath },
        fn: async () => execAsync(command, { cwd: executionWorkspacePath }),
    });
    if (!locked.success) {
        throw new Error(typeof locked.data === 'string' ? locked.data : locked.data.message);
    }
    const execResult = locked.data;
    if (!execResult.success) {
        throw new Error(execResult.data.message);
    }
}

function makeCheckoutWorkspaceFns({
    executionWorkspacePath,
    switchBackBranch,
    gitLock,
}: {
    executionWorkspacePath: string;
    switchBackBranch: string;
    gitLock?: GitCommonDirLockContext;
}): MakeLumpWorkspaceFnsOutput {
    const buildGitBody = ({ baseBranch, branchName }: { baseBranch: string; branchName: string }) => {
        const quotedBranch = shellSingleQuote(branchName);
        const quotedBase = shellSingleQuote(baseBranch);
        return [
            `git fetch --no-write-fetch-head origin ${quotedBase}`,
            `git switch ${quotedBase}`,
            `git reset --hard origin/${baseBranch}`,
            shellBestEffort(`git branch -D ${quotedBranch}`),
            `git switch -c ${quotedBranch}`,
        ].join(' && ');
    };

    const setupWorkspaceFn: SetupWorkspaceFn = async ({ baseBranch, branchName }) => {
        const gitBody = buildGitBody({ baseBranch, branchName });
        const branchWorkspacePath = executionWorkspacePath;

        if (gitLock) {
            await runGitBodyUnderLock({ executionWorkspacePath, gitBody, gitLock });
            return { command: '', workspacePath: branchWorkspacePath };
        }

        return {
            command: atDirectory(executionWorkspacePath, gitBody),
            workspacePath: branchWorkspacePath,
        };
    };

    const teardownWorkspaceFn: TeardownWorkspaceFn = async () => {
        const gitBody = `git switch ${shellSingleQuote(switchBackBranch)}`;
        if (gitLock) {
            await runGitBodyUnderLock({ executionWorkspacePath, gitBody, gitLock });
            return '';
        }
        return atDirectory(executionWorkspacePath, gitBody);
    };

    return { setupWorkspaceFn, teardownWorkspaceFn };
}

function makeWorktreeWorkspaceFns({
    executionWorkspacePath,
    switchBackBranch,
    gitLock,
}: {
    executionWorkspacePath: string;
    switchBackBranch: string;
    gitLock?: GitCommonDirLockContext;
}): MakeLumpWorkspaceFnsOutput {
    const buildSetupGitBody = ({
        baseBranch,
        branchName,
        branchWorkspacePath,
    }: {
        baseBranch: string;
        branchName: string;
        branchWorkspacePath: string;
    }) => {
        const quotedWorktree = shellSingleQuote(branchWorkspacePath);
        const quotedBranch = shellSingleQuote(branchName);
        const quotedOriginBase = shellSingleQuote(`origin/${baseBranch}`);
        const quotedBase = shellSingleQuote(baseBranch);
        const quotedSwitchBack = shellSingleQuote(switchBackBranch);

        return [
            `git fetch --no-write-fetch-head origin ${quotedBase}`,
            `git switch ${quotedSwitchBack}`,
            shellBestEffort(`git worktree remove --force ${quotedWorktree}`),
            shellRemoveDirectory(quotedWorktree),
            shellBestEffort(`git branch -D ${quotedBranch}`),
            shellBestEffort(shellEnsureDirectory(path.dirname(branchWorkspacePath))),
            `git worktree add -B ${quotedBranch} ${quotedWorktree} ${quotedOriginBase}`,
        ].join(' && ');
    };

    const setupWorkspaceFn: SetupWorkspaceFn = async ({ baseBranch, branchName }) => {
        const branchWorkspacePath = lumpWorktreePath({ executionWorkspacePath, branchName });
        const gitBody = buildSetupGitBody({ baseBranch, branchName, branchWorkspacePath });

        if (gitLock) {
            await runGitBodyUnderLock({ executionWorkspacePath, gitBody, gitLock });
            return { command: '', workspacePath: branchWorkspacePath };
        }

        return {
            command: atDirectory(executionWorkspacePath, gitBody),
            workspacePath: branchWorkspacePath,
        };
    };

    const teardownWorkspaceFn: TeardownWorkspaceFn = async ({ branchName }) => {
        const quotedWorktree = shellSingleQuote(
            lumpWorktreePath({ executionWorkspacePath, branchName }),
        );
        const gitBody = [
            shellBestEffort(`git worktree remove --force ${quotedWorktree}`),
            `git switch ${shellSingleQuote(switchBackBranch)}`,
        ].join(' && ');

        if (gitLock) {
            await runGitBodyUnderLock({ executionWorkspacePath, gitBody, gitLock });
            return '';
        }

        return atDirectory(executionWorkspacePath, gitBody);
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
