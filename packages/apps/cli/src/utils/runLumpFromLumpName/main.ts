import { failure, type Failure, success, type Success, type Logger } from '@lumpcode/core';

import type { LumpJsConfig } from '../../types';
import type { LocalConfig } from '../../types/LocalConfig';
import { getJsConfigFromLumpName } from '../getJsConfigFromLumpName';
import { lumpImportBasePath } from '../lumpDirPath';
import { preflightDiscoveryBranchWithLock } from '../preflightDiscoveryBranchWithLock';
import { readLocalConfig } from '../readLocalConfig';
import { resolveEffectiveDiscoveryBranch } from '../resolveEffectiveDiscoveryBranch';
import { resolveLumpDisabled } from '../resolveLumpDisabled';
import {
    toRunLumpMessageFailure,
    workspacePathBusyFailure,
    type RunLumpFromJsConfigFailure,
} from '../runLumpFromJsConfig/failures';
import {
    runLumpFromJsConfig,
    type RunLumpFromJsConfigSuccess,
} from '../runLumpFromJsConfig/main';
import { isWorkspacePathBusyError } from '../workspacePathLock';
import type { WorkspaceLockMode } from '../workspaceFileLock';

export type RunLumpFromLumpNameSuccess =
    | RunLumpFromJsConfigSuccess
    | {
          skipped: true;
          reason: 'disabled';
          reasonDetail: string;
      };

type DedicatedPhase1Data = {
    jsConfig: LumpJsConfig;
    disabled: boolean;
};

export async function runLumpFromLumpName(input: {
    lumpName: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    sourceProjectRoot: string;
    lockMode?: WorkspaceLockMode;
    projectName?: string;
    logger: Logger;
    localConfig?: LocalConfig;
    /** Pre-resolved discovery branch (dedicated). When omitted, resolved from lump config. */
    effectiveDiscoveryBranch?: string;
    /** Raw CLI `--discoveryBranch` for shared-mode warn-and-ignore. */
    discoveryBranchOpt?: string;
    /** When aborted, in-flight commands are killed and the lump run stops. */
    signal?: AbortSignal;
}): Promise<Success<RunLumpFromLumpNameSuccess> | Failure<RunLumpFromJsConfigFailure>> {
    const {
        lumpName,
        localConfigFolderPath,
        globalConfigFolderPath,
        sourceProjectRoot,
        lockMode = 'fail',
        projectName,
        logger,
        localConfig: providedLocalConfig,
        effectiveDiscoveryBranch: providedDiscoveryBranch,
        discoveryBranchOpt,
        signal: providedSignal,
    } = input;
    const signal = providedSignal ?? new AbortController().signal;

    let localConfig: LocalConfig;
    if (providedLocalConfig) {
        localConfig = providedLocalConfig;
    } else {
        const localConfigResult = await readLocalConfig({ localConfigFolderPath });
        if (!localConfigResult.success) {
            return failure(toRunLumpMessageFailure(localConfigResult.data));
        }
        localConfig = localConfigResult.data;
    }

    const workspaceStrategy = localConfig.workspaceStrategy ?? 'checkout';

    if (discoveryBranchOpt?.trim() && localConfig.mode === 'shared') {
        logger.info(
            '--discoveryBranch is ignored in shared mode; discovery workspace state is operator-managed.',
        );
    }

    if (localConfig.mode === 'shared') {
        const jsConfResult = await getJsConfigFromLumpName({ lumpName, localConfigFolderPath });
        if (!jsConfResult.success) {
            return failure(toRunLumpMessageFailure(jsConfResult.data));
        }

        const disabledResult = await resolveLumpDisabled(jsConfResult.data.disabled, {
            importBasePath: lumpImportBasePath({ localConfigFolderPath, lumpName }),
        });
        if (!disabledResult.success) {
            return failure(toRunLumpMessageFailure(disabledResult.data));
        }
        if (disabledResult.data.disabled) {
            return success({
                skipped: true,
                reason: 'disabled',
                reasonDetail: `Lump "${lumpName}" is disabled; skipping run.`,
            });
        }

        return runLumpFromJsConfig({
            jsConfig: jsConfResult.data,
            lumpName,
            localConfigFolderPath,
            globalConfigFolderPath,
            sourceProjectRoot,
            lockMode,
            projectName,
            logger,
            localConfig,
            signal,
        });
    }

    let effectiveDiscoveryBranch: string;
    if (providedDiscoveryBranch !== undefined) {
        effectiveDiscoveryBranch = providedDiscoveryBranch;
    } else {
        const discoveryResult = await resolveEffectiveDiscoveryBranch({
            discoveryBranchOpt,
            lumpName,
            localConfigFolderPath,
            localConfig,
            logger,
        });
        if (!discoveryResult.success) {
            return failure(toRunLumpMessageFailure(discoveryResult.data));
        }
        effectiveDiscoveryBranch = discoveryResult.data;
    }

    const phase1Result = await preflightDiscoveryBranchWithLock<DedicatedPhase1Data>({
        sourceProjectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
        localConfig,
        discoveryBranch: effectiveDiscoveryBranch,
        lumpName,
        lockMode,
        projectName,
        logger,
        holdForRun: true,
        workspaceStrategy,
        fn: async () => {
            const jsConfResult = await getJsConfigFromLumpName({ lumpName, localConfigFolderPath });
            if (!jsConfResult.success) {
                return failure(jsConfResult.data);
            }

            const disabledResult = await resolveLumpDisabled(jsConfResult.data.disabled, {
                importBasePath: lumpImportBasePath({ localConfigFolderPath, lumpName }),
            });
            if (!disabledResult.success) {
                return failure(disabledResult.data);
            }
            if (disabledResult.data.disabled) {
                return success({ jsConfig: jsConfResult.data, disabled: true });
            }

            return success({ jsConfig: jsConfResult.data, disabled: false });
        },
    });

    if (!phase1Result.success) {
        const err = phase1Result.data;
        if (typeof err === 'string') {
            return failure(toRunLumpMessageFailure(err));
        }
        if (isWorkspacePathBusyError(err)) {
            return failure(workspacePathBusyFailure(err));
        }
        return failure(toRunLumpMessageFailure(String(err)));
    }

    const { data: phase1Data, releaseLock } = phase1Result.data;

    if (phase1Data.disabled) {
        if (releaseLock) {
            await releaseLock();
        }
        return success({
            skipped: true,
            reason: 'disabled',
            reasonDetail: `Lump "${lumpName}" is disabled; skipping run.`,
        });
    }

    return runLumpFromJsConfig({
        jsConfig: phase1Data.jsConfig,
        lumpName,
        localConfigFolderPath,
        globalConfigFolderPath,
        sourceProjectRoot,
        lockMode,
        projectName,
        logger,
        localConfig,
        releaseLock,
        signal,
    });
}
