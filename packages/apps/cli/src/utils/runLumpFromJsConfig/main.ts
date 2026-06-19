import path from "node:path";

import { failure, Failure, runLump, RunLumpOutput, success, Success, type Logger } from "@lumpcode/core";

import { LumpJsConfig } from "../../types";
import type { WorkspaceStrategy } from "../../types/WorkspaceStrategy";
import {
    acquireBranchWorkspaceLock,
    type BranchWorkspaceBusyError,
    type BranchWorkspaceLockMode,
} from "../branchWorkspaceLock";
import { countOpenLumpBranches } from "../countOpenLumpBranches";
import { jsConfigToRunLumpInput } from "../jsConfigToRunLumpInput";
import { resolveBranchWorkspacePathForLumpRun } from "../resolveBranchWorkspacePathForLumpRun";
import { updateContextStatusRecord } from "../updateContextStatusRecord";

export type { BranchWorkspaceBusyError } from '../branchWorkspaceLock';
export { isBranchWorkspaceBusyError } from '../branchWorkspaceLock';

export type RunLumpFromJsConfigSuccess =
    | {
        skipped: true;
        reason: 'tooManyOpenBranches';
        reasonDetail: string;
        openBranchCount: number;
        maximumNumberOfConcurrentBranches: number;
    }
    | ({ skipped: false } & RunLumpOutput);

export async function runLumpFromJsConfig(input: {
    jsConfig: LumpJsConfig;
    lumpName: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    /** Project-wide base branch (from `.lumpcode/local.json`). */
    projectBaseBranch: string;
    /** Execution workspace (git repo root) resolved by pre-flight. */
    executionWorkspacePath: string;
    workspaceStrategy: WorkspaceStrategy;
    lockMode?: BranchWorkspaceLockMode;
    projectName?: string;
    logger: Logger;
}): Promise<
    Success<RunLumpFromJsConfigSuccess> | Failure<string | BranchWorkspaceBusyError>
> {
    const {
        jsConfig,
        lumpName,
        localConfigFolderPath,
        globalConfigFolderPath,
        projectBaseBranch,
        executionWorkspacePath,
        workspaceStrategy,
        lockMode = 'fail',
        projectName,
        logger,
    } = input;

    const projectRoot = path.dirname(localConfigFolderPath);
    const effectiveBaseBranch = jsConfig.baseBranch ?? projectBaseBranch;

    const runLumpInputResult = await jsConfigToRunLumpInput({
        config: jsConfig,
        lumpName,
        localConfigFolderPath,
        globalConfigFolderPath,
        projectBaseBranch,
        executionWorkspacePath,
        workspaceStrategy,
        logger,
    });

    if (!runLumpInputResult.success) return failure(runLumpInputResult.data);

    const { maximumNumberOfConcurrentBranches } = jsConfig;
    if (
        typeof maximumNumberOfConcurrentBranches === 'number' &&
        maximumNumberOfConcurrentBranches >= 0
    ) {
        const openBranchCount = await countOpenLumpBranches({ executionWorkspacePath, lumpName });
        if (openBranchCount >= maximumNumberOfConcurrentBranches) {
            return success({
                skipped: true,
                openBranchCount,
                maximumNumberOfConcurrentBranches,
                reason: 'tooManyOpenBranches',
                reasonDetail:
                    `Lump "${lumpName}" has ${openBranchCount} open branch(es), ` +
                    `which meets or exceeds the configured ` +
                    `maximumNumberOfConcurrentBranches (${maximumNumberOfConcurrentBranches}). ` +
                    `Skipping run.`,
            } satisfies RunLumpFromJsConfigSuccess);
        }
    }

    const runLumpInput = runLumpInputResult.data;

    const branchPathResult = await resolveBranchWorkspacePathForLumpRun({
        runLumpInput: runLumpInput,
        localConfigFolderPath,
        executionWorkspacePath,
        workspaceStrategy,
    });
    if (!branchPathResult.success) return failure(branchPathResult.data);

    let releaseLock: (() => Promise<void>) | undefined;
    const branchPathResultData = branchPathResult.data;
    if (branchPathResultData.needsLock) {
        const lockResult = await acquireBranchWorkspaceLock({
            globalConfigFolderPath,
            branchWorkspacePath: branchPathResultData.branchWorkspacePath,
            lumpName,
            mode: lockMode,
            projectName,
            logger,
        });
        if (!lockResult.success) return failure(lockResult.data);
        releaseLock = lockResult.data;
    }

    try {
        const runLumpResult = await runLump(runLumpInput);

        if (!runLumpResult.success) return failure(runLumpResult.data.message);

        const updateContextStatusRecordResult = await updateContextStatusRecord({
            projectRoot,
            lumpName,
            baseBranch: effectiveBaseBranch,
        });

        if (!updateContextStatusRecordResult.success) {
            logger.error(`Failed to update context status record: ${updateContextStatusRecordResult.data}`);
        }

        return success({ skipped: false as const, ...runLumpResult.data });
    } finally {
        if (releaseLock) {
            await releaseLock();
        }
    }
}
