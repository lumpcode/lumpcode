import type { Failure, Logger, SetupWorkspaceFn, Success } from '@lumpcode/core';

import type { Mode } from '../../types/Mode';
import type { WorkspaceStrategy } from '../../types/WorkspaceStrategy';
import { acquireBranchWorkspaceLock } from '../branchWorkspaceLock';
import { branchWorkspacePath } from '../branchWorkspacePath';
import { acquireExecutionWorkspaceLock } from '../executionWorkspaceLock';
import { withSetupWorkspaceAfterExec } from '../makeLumpWorkspaceFns';
import type { WorkspaceLockMode } from '../workspaceFileLock';
import {
    branchWorkspaceBusyFailure,
    executionWorkspaceBusyFailure,
    toRunLumpMessageFailure,
    type RunLumpFromJsConfigFailure,
} from './failures';

/** Aborts setup shell exec when lock acquisition or preflight fails inside the hook. */
const SETUP_BLOCKED_COMMAND = 'node -e "process.exit(1)"';

export type WorkspaceLockSession = {
    releaseBranchLock?: () => Promise<void>;
    releaseExecutionLock?: () => Promise<void>;
    pendingFailure?: RunLumpFromJsConfigFailure;
};

export type WorkspaceLockHooksContext = {
    mode: Mode;
    workspaceStrategy: WorkspaceStrategy;
    executionWorkspacePath: string;
    globalConfigFolderPath: string;
    lumpName: string;
    projectName?: string;
    lockMode: WorkspaceLockMode;
    logger: Logger;
    preflight: () => Promise<Success<void> | Failure<string>>;
};

export function createWorkspaceLockSession(): WorkspaceLockSession {
    return {};
}

function needsBranchWorkspaceLock(input: { mode: Mode; workspaceStrategy: WorkspaceStrategy }): boolean {
    return input.mode === 'shared' || input.workspaceStrategy === 'worktree';
}

function needsExecutionWorkspaceLock(mode: Mode): boolean {
    return mode === 'dedicated';
}

function blockedSetupResult(workspacePath: string) {
    return {
        command: SETUP_BLOCKED_COMMAND,
        workspacePath,
    };
}

export function withWorkspaceLockHooks(input: {
    setupWorkspaceFn: SetupWorkspaceFn;
    session: WorkspaceLockSession;
    ctx: WorkspaceLockHooksContext;
}): SetupWorkspaceFn {
    const { setupWorkspaceFn, session, ctx } = input;

    return async (setupInput) => {
        const branchWorkspacePathValue = branchWorkspacePath({
            executionWorkspacePath: ctx.executionWorkspacePath,
            workspaceStrategy: ctx.workspaceStrategy,
            branchName: setupInput.branchName,
        });

        if (needsExecutionWorkspaceLock(ctx.mode)) {
            const execLockResult = await acquireExecutionWorkspaceLock({
                globalConfigFolderPath: ctx.globalConfigFolderPath,
                executionWorkspacePath: ctx.executionWorkspacePath,
                lumpName: ctx.lumpName,
                mode: ctx.lockMode,
                projectName: ctx.projectName,
                logger: ctx.logger,
            });
            if (!execLockResult.success) {
                session.pendingFailure = executionWorkspaceBusyFailure(execLockResult.data);
                return blockedSetupResult(branchWorkspacePathValue);
            }
            session.releaseExecutionLock = execLockResult.data;
        }

        const preflightResult = await ctx.preflight();
        if (!preflightResult.success) {
            session.pendingFailure = toRunLumpMessageFailure(preflightResult.data);
            return blockedSetupResult(branchWorkspacePathValue);
        }

        if (needsBranchWorkspaceLock(ctx)) {
            const branchLockResult = await acquireBranchWorkspaceLock({
                globalConfigFolderPath: ctx.globalConfigFolderPath,
                branchWorkspacePath: branchWorkspacePathValue,
                lumpName: ctx.lumpName,
                mode: ctx.lockMode,
                projectName: ctx.projectName,
                logger: ctx.logger,
            });
            if (!branchLockResult.success) {
                session.pendingFailure = branchWorkspaceBusyFailure(branchLockResult.data);
                return blockedSetupResult(branchWorkspacePathValue);
            }
            session.releaseBranchLock = branchLockResult.data;
        }

        const innerSetupFn =
            ctx.mode === 'dedicated' && ctx.workspaceStrategy === 'worktree'
                ? withSetupWorkspaceAfterExec(setupWorkspaceFn, async () => {
                    if (session.releaseExecutionLock) {
                        const releaseExecutionLockFn = session.releaseExecutionLock;
                        session.releaseExecutionLock = undefined;
                        await releaseExecutionLockFn();
                    }
                })
                : setupWorkspaceFn;

        return innerSetupFn(setupInput);
    };
}

export async function releaseWorkspaceLockSession(session: WorkspaceLockSession): Promise<void> {
    if (session.releaseBranchLock) {
        await session.releaseBranchLock();
        session.releaseBranchLock = undefined;
    }
    if (session.releaseExecutionLock) {
        await session.releaseExecutionLock();
        session.releaseExecutionLock = undefined;
    }
}
