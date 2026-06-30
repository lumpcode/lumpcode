import type { Failure, Logger, RunLumpInput, RunLumpOutput, Success } from '@lumpcode/core';
import { failure, runLump, success } from '@lumpcode/core';

import {
    acquireBranchWorkspaceLock,
} from '../branchWorkspaceLock';
import {
    acquireExecutionWorkspaceLock,
} from '../executionWorkspaceLock';
import { withSetupWorkspaceAfterExec } from '../makeLumpWorkspaceFns';
import type { WorkspaceLockMode } from '../workspaceFileLock';
import type { RunLumpFromJsConfigFailure } from './failures';
import {
    branchWorkspaceBusyFailure,
    executionWorkspaceBusyFailure,
    toRunLumpMessageFailure,
} from './failures';
import { planNeedsBranchLock, type WorkspaceLockPlan } from './resolveWorkspaceLockPlan';

export async function runLumpWithWorkspaceLocks(input: {
    plan: WorkspaceLockPlan;
    runLumpInput: RunLumpInput;
    globalConfigFolderPath: string;
    lumpName: string;
    projectName?: string;
    lockMode: WorkspaceLockMode;
    logger: Logger;
    preflight: () => Promise<Success<void> | Failure<string>>;
}): Promise<Success<RunLumpOutput> | Failure<RunLumpFromJsConfigFailure>> {
    const { plan, globalConfigFolderPath, lumpName, projectName, lockMode, logger, preflight } = input;
    let runLumpInput = input.runLumpInput;

    if (plan.kind === 'none') {
        const runLumpResult = await runLump(runLumpInput);
        if (!runLumpResult.success) return failure(toRunLumpMessageFailure(runLumpResult.data.message));
        return success(runLumpResult.data);
    }

    let releaseExecutionLock: (() => Promise<void>) | undefined;
    let releaseBranchLock: (() => Promise<void>) | undefined;
    let executionLockReleasedEarly = false;

    try {
        if (plan.kind === 'dedicated-checkout' || plan.kind === 'dedicated-worktree') {
            const execLockResult = await acquireExecutionWorkspaceLock({
                globalConfigFolderPath,
                executionWorkspacePath: plan.executionWorkspacePath,
                lumpName,
                mode: lockMode,
                projectName,
                logger,
            });
            if (!execLockResult.success) {
                return failure(executionWorkspaceBusyFailure(execLockResult.data));
            }
            releaseExecutionLock = execLockResult.data;
        }

        const preflightResult = await preflight();
        if (!preflightResult.success) return failure(toRunLumpMessageFailure(preflightResult.data));

        if (planNeedsBranchLock(plan)) {
            const lockResult = await acquireBranchWorkspaceLock({
                globalConfigFolderPath,
                branchWorkspacePath: plan.branchWorkspacePath,
                lumpName,
                mode: lockMode,
                projectName,
                logger,
            });
            if (!lockResult.success) return failure(branchWorkspaceBusyFailure(lockResult.data));
            releaseBranchLock = lockResult.data;
        }

        if (plan.kind === 'dedicated-worktree' && releaseExecutionLock && runLumpInput.setupWorkspaceFn) {
            const releaseExecutionLockFn = releaseExecutionLock;
            runLumpInput = {
                ...runLumpInput,
                setupWorkspaceFn: withSetupWorkspaceAfterExec(
                    runLumpInput.setupWorkspaceFn,
                    async () => {
                        if (!executionLockReleasedEarly) {
                            await releaseExecutionLockFn();
                            executionLockReleasedEarly = true;
                        }
                    },
                ),
            };
        }

        const runLumpResult = await runLump(runLumpInput);
        if (!runLumpResult.success) return failure(toRunLumpMessageFailure(runLumpResult.data.message));
        return success(runLumpResult.data);
    } finally {
        if (releaseBranchLock) {
            await releaseBranchLock();
        }
        if (releaseExecutionLock && !executionLockReleasedEarly) {
            await releaseExecutionLock();
        }
    }
}
