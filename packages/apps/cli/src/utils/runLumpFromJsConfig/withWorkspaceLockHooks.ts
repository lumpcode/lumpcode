import * as path from 'node:path';

import type { Failure, Logger, SetupWorkspaceFn, Success } from '@lumpcode/core';

import type { Mode } from '../../types/Mode';
import type { WorkspaceStrategy } from '../../types/WorkspaceStrategy';
import { branchWorkspacePath } from '../branchWorkspacePath';
import {
    acquireWorkspacePathLock,
    type ReleaseWorkspacePathLockFn,
} from '../workspacePathLock';
import type { WorkspaceLockMode } from '../workspaceFileLock';
import {
    toRunLumpMessageFailure,
    workspacePathBusyFailure,
    type RunLumpFromJsConfigFailure,
} from './failures';

/** Aborts setup shell exec when lock acquisition or preflight fails inside the hook. */
const SETUP_BLOCKED_COMMAND = 'node -e "process.exit(1)"';

export type WorkspaceLockSession = {
    releaseExecutionPathLock?: ReleaseWorkspacePathLockFn;
    releaseBranchPathLock?: ReleaseWorkspacePathLockFn;
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

function blockedSetupResult(workspacePath: string) {
    return {
        command: SETUP_BLOCKED_COMMAND,
        workspacePath,
    };
}

async function acquirePathLockOrBusy(input: {
    globalConfigFolderPath: string;
    workspacePath: string;
    lumpName: string;
    lockMode: WorkspaceLockMode;
    projectName?: string;
    logger: Logger;
    session: WorkspaceLockSession;
    assign: 'execution' | 'branch';
}): Promise<boolean> {
    const lockResult = await acquireWorkspacePathLock({
        globalConfigFolderPath: input.globalConfigFolderPath,
        workspacePath: input.workspacePath,
        lumpName: input.lumpName,
        mode: input.lockMode,
        projectName: input.projectName,
        logger: input.logger,
    });
    if (!lockResult.success) {
        input.session.pendingFailure = workspacePathBusyFailure(lockResult.data);
        return false;
    }
    if (input.assign === 'execution') {
        input.session.releaseExecutionPathLock = lockResult.data;
    } else {
        input.session.releaseBranchPathLock = lockResult.data;
    }
    return true;
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

        const resolvedExecutionPath = path.resolve(ctx.executionWorkspacePath);
        const resolvedBranchPath = path.resolve(branchWorkspacePathValue);

        if (ctx.mode === 'dedicated') {
            if (!session.releaseExecutionPathLock) {
                if (
                    !(await acquirePathLockOrBusy({
                        globalConfigFolderPath: ctx.globalConfigFolderPath,
                        workspacePath: resolvedExecutionPath,
                        lumpName: ctx.lumpName,
                        lockMode: ctx.lockMode,
                        projectName: ctx.projectName,
                        logger: ctx.logger,
                        session,
                        assign: 'execution',
                    }))
                ) {
                    return blockedSetupResult(branchWorkspacePathValue);
                }
            }

            const preflightResult = await ctx.preflight();
            if (!preflightResult.success) {
                session.pendingFailure = toRunLumpMessageFailure(preflightResult.data);
                return blockedSetupResult(branchWorkspacePathValue);
            }

            if (ctx.workspaceStrategy === 'worktree') {
                if (
                    !(await acquirePathLockOrBusy({
                        globalConfigFolderPath: ctx.globalConfigFolderPath,
                        workspacePath: resolvedBranchPath,
                        lumpName: ctx.lumpName,
                        lockMode: ctx.lockMode,
                        projectName: ctx.projectName,
                        logger: ctx.logger,
                        session,
                        assign: 'branch',
                    }))
                ) {
                    return blockedSetupResult(branchWorkspacePathValue);
                }

                // Setup may return command: '' after running git under the common-dir
                // lock; core skips afterExec when command is empty, so release the
                // execution-path lock here once setup returns (success or throw).
                try {
                    return await setupWorkspaceFn(setupInput);
                } finally {
                    if (session.releaseExecutionPathLock) {
                        const releaseExecutionPathLockFn = session.releaseExecutionPathLock;
                        session.releaseExecutionPathLock = undefined;
                        await releaseExecutionPathLockFn();
                    }
                }
            }

            return setupWorkspaceFn(setupInput);
        }

        if (
            !(await acquirePathLockOrBusy({
                globalConfigFolderPath: ctx.globalConfigFolderPath,
                workspacePath: resolvedBranchPath,
                lumpName: ctx.lumpName,
                lockMode: ctx.lockMode,
                projectName: ctx.projectName,
                logger: ctx.logger,
                session,
                assign: 'branch',
            }))
        ) {
            return blockedSetupResult(branchWorkspacePathValue);
        }

        const preflightResult = await ctx.preflight();
        if (!preflightResult.success) {
            session.pendingFailure = toRunLumpMessageFailure(preflightResult.data);
            return blockedSetupResult(branchWorkspacePathValue);
        }

        return setupWorkspaceFn(setupInput);
    };
}

export async function releaseWorkspaceLockSession(session: WorkspaceLockSession): Promise<void> {
    if (session.releaseBranchPathLock) {
        await session.releaseBranchPathLock();
        session.releaseBranchPathLock = undefined;
    }
    if (session.releaseExecutionPathLock) {
        await session.releaseExecutionPathLock();
        session.releaseExecutionPathLock = undefined;
    }
}
