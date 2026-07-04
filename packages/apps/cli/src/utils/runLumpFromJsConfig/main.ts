import path from 'node:path';

import { failure, Failure, runLump, RunLumpOutput, success, Success, type Logger } from '@lumpcode/core';

import { LumpJsConfig } from '../../types';
import type { LocalConfig } from '../../types/LocalConfig';
import { getExecutionWorkspacePath } from '../getExecutionWorkspacePath';
import { getProjectName } from '../getProjectName';
import { jsConfigToRunLumpInput } from '../jsConfigToRunLumpInput';
import { readLocalConfig } from '../readLocalConfig';
import { resolvePrimaryBranch } from '../resolvePrimaryBranches';
import { resolveLumpBranches } from '../resolveLumpBranches';
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
    /** When set, skips reading `.lumpcode/local.json` (e.g. daemon frozen config). */
    localConfig?: LocalConfig;
    /** Held execution workspace path lock from dedicated discovery preflight; adopted in setup hooks. */
    releaseLock?: ReleaseWorkspacePathLockFn;
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
    } = input;

    const session = createWorkspaceLockSession();
    if (releaseLock) {
        session.releaseExecutionPathLock = releaseLock;
    }

    try {
        const projectRoot = path.dirname(localConfigFolderPath);

        let localConfig: LocalConfig;
        if (providedLocalConfig) {
            localConfig = providedLocalConfig;
        } else {
            const localConfigResult = await readLocalConfig({ localConfigFolderPath });
            if (!localConfigResult.success) return failure(toRunLumpMessageFailure(localConfigResult.data));
            localConfig = localConfigResult.data;
        }

        const projectBaseBranch = resolvePrimaryBranch(localConfig, logger);
        const workspaceStrategy = localConfig.workspaceStrategy ?? 'checkout';

        const branches = resolveLumpBranches({
            lumpConfig: jsConfig,
            localConfig,
        });
        const resolvedBaseBranch = branches.resolvedBaseBranch;

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

        const runLumpResult = await runLump(runLumpInput);
        if (session.pendingFailure) {
            return failure(session.pendingFailure);
        }
        if (!runLumpResult.success) {
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
