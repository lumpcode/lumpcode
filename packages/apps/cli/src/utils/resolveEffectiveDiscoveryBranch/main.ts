import type { Failure, Logger, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import type { LocalConfig } from '../../types/LocalConfig';
import { getJsConfigFromLumpName } from '../getJsConfigFromLumpName';
import { resolveLumpBranches } from '../resolveLumpBranches';
import { resolvePrimaryBranches } from '../resolvePrimaryBranches';
import { validateLumpDiscoveryBranchAllowlist } from '../validateLumpDiscoveryBranchAllowlist';

export async function resolveEffectiveDiscoveryBranch(input: {
    discoveryBranchOpt?: string;
    lumpName: string;
    localConfigFolderPath: string;
    localConfig: LocalConfig;
    logger?: Logger;
    /** When true, log once if discoveryBranchOpt is ignored in shared mode. */
    warnSharedDiscoveryBranchIgnored?: boolean;
}): Promise<Success<string> | Failure<string>> {
    const {
        discoveryBranchOpt,
        lumpName,
        localConfigFolderPath,
        localConfig,
        logger,
        warnSharedDiscoveryBranchIgnored = false,
    } = input;

    const trimmedOpt = discoveryBranchOpt?.trim();

    if (trimmedOpt && localConfig.mode === 'shared') {
        if (warnSharedDiscoveryBranchIgnored) {
            logger?.info(
                '--discoveryBranch is ignored in shared mode; discovery workspace state is operator-managed.',
            );
        }
    }

    if (trimmedOpt && localConfig.mode === 'dedicated') {
        const allowlistResult = validateLumpDiscoveryBranchAllowlist({
            mode: localConfig.mode,
            lumpName,
            resolvedDiscoveryBranch: trimmedOpt,
            effectivePrimaryBranches: resolvePrimaryBranches(localConfig, logger),
        });
        if (!allowlistResult.success) {
            return failure(allowlistResult.data);
        }
        return success(trimmedOpt);
    }

    const jsConfResult = await getJsConfigFromLumpName({ lumpName, localConfigFolderPath });
    if (!jsConfResult.success) {
        return failure(jsConfResult.data);
    }

    const { resolvedDiscoveryBranch } = resolveLumpBranches({
        lumpConfig: jsConfResult.data,
        localConfig,
    });

    const allowlistResult = validateLumpDiscoveryBranchAllowlist({
        mode: localConfig.mode,
        lumpName,
        resolvedDiscoveryBranch,
        effectivePrimaryBranches: resolvePrimaryBranches(localConfig, logger),
    });
    if (!allowlistResult.success) {
        return failure(allowlistResult.data);
    }

    return success(resolvedDiscoveryBranch);
}
