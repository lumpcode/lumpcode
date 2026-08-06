import path from 'node:path';

import { failure, Failure, runLump, RunLumpOutput, success, Success, type Logger } from '@lumpcode/core';

import { LumpJsConfig } from '../../types';
import type { LocalConfig } from '../../types/LocalConfig';
import type { ResolvedProjectLocalConfig } from '../../types/ResolvedProjectLocalConfig';
import { coerceResolvedProjectLocalConfig } from '../coerceResolvedProjectLocalConfig';
import type { GitCommonDirLockContext } from '../gitCommonDirLock';
import { getExecutionWorkspacePath } from '../getExecutionWorkspacePath';
import { getProjectName } from '../getProjectName';
import { jsConfigToRunLumpInput } from '../jsConfigToRunLumpInput';
import { resolvePrimaryBranch } from '../resolvePrimaryBranches';
import { runProjectPreflight } from '../runProjectPreflight';
import { updateContextStatusRecord } from '../updateContextStatusRecord';
import type { ReleaseWorkspacePathLockFn } from '../workspacePathLock';
import type { WorkspaceLockMode } from '../workspaceFileLock';
import { evaluateTooManyOpenBranchesSkip } from './evaluateTooManyOpenBranchesSkip';
import type { RunLumpFromJsConfigFailure } from './failures';
import {
    toRunLumpMessageFailure,
} from './failures';
import {
    createWorkspaceLockSession,
    releaseWorkspaceLockSession,
    withWorkspaceLockHooks,
} from './withWorkspaceLockHooks';

export type { WorkspacePathBusyError } from '../workspacePathLock';
export type { RunLumpFromJsConfigFailure } from './failures';
export {
    isRunLumpWorkspacePathBusyFailure,
    runLumpFromJsConfigFailureMessage,
    toRunLumpMessageFailure,
    workspacePathBusyFailure,
} from './failures';
export { evaluateTooManyOpenBranchesSkip } from './evaluateTooManyOpenBranchesSkip';
export type { TooManyOpenBranchesSkip } from './evaluateTooManyOpenBranchesSkip';

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
    /** When set, skips re-reading local.json (e.g. daemon frozen merged config). */
    localConfig?: LocalConfig | ResolvedProjectLocalConfig;
    /** Held execution workspace path lock from dedicated discovery preflight; adopted in setup hooks. */
    releaseLock?: ReleaseWorkspacePathLockFn;
    /** When aborted, in-flight commands are killed and the lump run stops. */
    signal?: AbortSignal;
    /** Concrete discovery branch from phase 1 / CLI flag (dedicated). */
    effectiveDiscoveryBranch?: string;
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
        releaseLock,
        signal,
        effectiveDiscoveryBranch,
    } = input;

    const session = createWorkspaceLockSession();
    if (releaseLock) {
        session.releaseExecutionPathLock = releaseLock;
    }

    try {
        const projectRoot = path.dirname(localConfigFolderPath);

        const resolvedResult = await coerceResolvedProjectLocalConfig({
            localConfigFolderPath,
            localConfig: providedLocalConfig,
        });
        if (!resolvedResult.success) {
            return failure(toRunLumpMessageFailure(resolvedResult.data));
        }
        const localConfig = resolvedResult.data;

        const projectBaseBranch = resolvePrimaryBranch(localConfig, logger);
        const workspaceStrategy = localConfig.workspaceStrategy;

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

        const gitLock: GitCommonDirLockContext = {
            globalConfigFolderPath,
            gitCwd: tentativeExecutionWorkspacePath,
            lumpName,
            lockMode,
            projectName,
            logger,
        };

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
            effectiveDiscoveryBranch,
            gitLock,
        });

        if (!runLumpInputResult.success) return failure(toRunLumpMessageFailure(runLumpInputResult.data));

        const resolvedBaseBranch = runLumpInputResult.data.baseBranch;

        const tooManySkip = await evaluateTooManyOpenBranchesSkip({
            jsConfig,
            lumpName,
            executionWorkspacePath: tentativeExecutionWorkspacePath,
        });
        if (tooManySkip) {
            return success(tooManySkip);
        }

        const runLumpInput = {
            ...runLumpInputResult.data,
            signal,
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
                            gitLock: {
                                globalConfigFolderPath,
                                lumpName,
                                lockMode,
                                projectName,
                                logger,
                            },
                        }).then((result) =>
                            result.success ? success(undefined) : failure(result.data),
                        ),
                },
            }),
        };

        const runLumpResult = await runLump(runLumpInput);
        if (session.pendingFailure) {
            return failure(session.pendingFailure);
        }
        if (!runLumpResult.success) {
            if (runLumpResult.data.reason === 'workspaceTeardownFailed') {
                logger.warn(
                    'Workspace teardown failed after the lump finished; git commit/push usually already succeeded. Next preflight should reset the execution workspace.',
                );
            }
            return failure(toRunLumpMessageFailure(runLumpResult.data.message));
        }

        const updateContextStatusRecordResult = await updateContextStatusRecord({
            projectRoot,
            lumpName,
            baseBranch: resolvedBaseBranch,
        });
        if (!updateContextStatusRecordResult.success) {
            logger.error(`Failed to update context status record: ${updateContextStatusRecordResult.data}`);
        }

        return success({ skipped: false as const, ...runLumpResult.data });
    } finally {
        await releaseWorkspaceLockSession(session);
    }
}
