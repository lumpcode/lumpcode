import path from "node:path";

import { failure, Failure, runLump, RunLumpOutput, success, Success, type Logger } from "@lumpcode/core";

import { LumpJsConfig } from "../../types";
import type { LocalConfig } from "../../types/LocalConfig";
import { countOpenLumpBranches } from "../countOpenLumpBranches";
import { getExecutionWorkspacePath } from "../getExecutionWorkspacePath";
import { getProjectName } from "../getProjectName";
import { jsConfigToRunLumpInput } from "../jsConfigToRunLumpInput";
import { readLocalConfig } from "../readLocalConfig";
import { resolveDiscoveryBranches, resolvePrimaryDiscoveryBranch } from "../resolveDiscoveryBranches";
import { resolveLumpBranches } from "../resolveLumpBranches";
import { runProjectPreflight } from "../runProjectPreflight";
import { validateLumpDiscoveryBranchAllowlist } from "../validateLumpDiscoveryBranchAllowlist";
import { updateContextStatusRecord } from "../updateContextStatusRecord";
import type { WorkspaceLockMode } from "../workspaceFileLock";
import type { RunLumpFromJsConfigFailure } from "./failures";
import {
    toRunLumpMessageFailure,
} from "./failures";
import {
    createWorkspaceLockSession,
    releaseWorkspaceLockSession,
    withWorkspaceLockHooks,
} from "./withWorkspaceLockHooks";

export type { BranchWorkspaceBusyError } from '../branchWorkspaceLock';
export type { ExecutionWorkspaceBusyError } from '../executionWorkspaceLock';
export type { RunLumpFromJsConfigFailure } from './failures';
export {
    branchWorkspaceBusyFailure,
    executionWorkspaceBusyFailure,
    isRunLumpBranchWorkspaceBusyFailure,
    isRunLumpExecutionWorkspaceBusyFailure,
    runLumpFromJsConfigFailureMessage,
    toRunLumpMessageFailure,
} from './failures';

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
    /** Project workspace: directory containing `.lumpcode/` and `.git/`. */
    sourceProjectRoot: string;
    lockMode?: WorkspaceLockMode;
    projectName?: string;
    logger: Logger;
    /** When set, skips reading `.lumpcode/local.json` (e.g. daemon frozen config). */
    localConfig?: LocalConfig;
}): Promise<Success<RunLumpFromJsConfigSuccess> | Failure<RunLumpFromJsConfigFailure>> {
    const {
        jsConfig,
        lumpName,
        localConfigFolderPath,
        globalConfigFolderPath,
        sourceProjectRoot,
        lockMode = 'fail',
        projectName: projectNameInput,
        logger,
        localConfig: providedLocalConfig,
    } = input;

    const projectRoot = path.dirname(localConfigFolderPath);

    let localConfig: LocalConfig;
    if (providedLocalConfig) {
        localConfig = providedLocalConfig;
    } else {
        const localConfigResult = await readLocalConfig({ localConfigFolderPath });
        if (!localConfigResult.success) return failure(toRunLumpMessageFailure(localConfigResult.data));
        localConfig = localConfigResult.data;
    }

    const projectBaseBranch = resolvePrimaryDiscoveryBranch(localConfig);
    const workspaceStrategy = localConfig.workspaceStrategy ?? 'checkout';

    const branches = resolveLumpBranches({
        lumpConfig: jsConfig,
        localConfig,
    });
    const resolvedBaseBranch = branches.resolvedBaseBranch;

    const allowlistResult = validateLumpDiscoveryBranchAllowlist({
        mode: localConfig.mode,
        lumpName,
        resolvedDiscoveryBranch: branches.resolvedDiscoveryBranch,
        effectiveDiscoveryBranches: resolveDiscoveryBranches(localConfig),
    });
    if (!allowlistResult.success) return failure(toRunLumpMessageFailure(allowlistResult.data));

    const projectNameResult = await getProjectName({
        localConfigFolderPath,
        projectRoot: sourceProjectRoot,
    });
    if (!projectNameResult.success) return failure(toRunLumpMessageFailure(projectNameResult.data));
    const projectName = projectNameInput ?? projectNameResult.data;

    const tentativeExecutionWorkspacePath = getExecutionWorkspacePath({
        mode: localConfig.mode,
        sourceProjectRoot,
        globalConfigFolderPath,
        projectName,
    });

    const runLumpInputResult = await jsConfigToRunLumpInput({
        config: jsConfig,
        lumpName,
        localConfigFolderPath,
        globalConfigFolderPath,
        projectBaseBranch,
        executionWorkspacePath: tentativeExecutionWorkspacePath,
        workspaceStrategy,
        logger,
        localConfig,
    });

    if (!runLumpInputResult.success) return failure(toRunLumpMessageFailure(runLumpInputResult.data));

    const { maximumNumberOfConcurrentBranches } = jsConfig;
    if (
        typeof maximumNumberOfConcurrentBranches === 'number' &&
        maximumNumberOfConcurrentBranches >= 0
    ) {
        const openBranchCount = await countOpenLumpBranches({
            executionWorkspacePath: tentativeExecutionWorkspacePath,
            lumpName,
        });
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

    const session = createWorkspaceLockSession();
    const runLumpInput = {
        ...runLumpInputResult.data,
        setupWorkspaceFn: withWorkspaceLockHooks({
            setupWorkspaceFn: runLumpInputResult.data.setupWorkspaceFn!,
            session,
            ctx: {
                mode: localConfig.mode,
                workspaceStrategy,
                executionWorkspacePath: tentativeExecutionWorkspacePath,
                globalConfigFolderPath,
                lumpName,
                projectName,
                lockMode,
                logger,
                preflight: () =>
                    runProjectPreflight({
                        sourceProjectRoot,
                        localConfigFolderPath,
                        globalConfigFolderPath,
                        localConfig,
                        targetBranch: resolvedBaseBranch,
                    }).then((result) =>
                        result.success ? success(undefined) : failure(result.data),
                    ),
            },
        }),
    };

    let runLumpOutput: RunLumpOutput;
    try {
        const runLumpResult = await runLump(runLumpInput);
        if (session.pendingFailure) {
            return failure(session.pendingFailure);
        }
        if (!runLumpResult.success) {
            return failure(toRunLumpMessageFailure(runLumpResult.data.message));
        }
        runLumpOutput = runLumpResult.data;
    } finally {
        await releaseWorkspaceLockSession(session);
    }

    const updateContextStatusRecordResult = await updateContextStatusRecord({
        projectRoot,
        lumpName,
        baseBranch: resolvedBaseBranch,
    });
    if (!updateContextStatusRecordResult.success) {
        logger.error(`Failed to update context status record: ${updateContextStatusRecordResult.data}`);
    }

    return success({ skipped: false as const, ...runLumpOutput });
}
