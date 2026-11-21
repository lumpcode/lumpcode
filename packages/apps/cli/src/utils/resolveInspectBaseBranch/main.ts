import type { Failure, Success } from '@lumpcode/core';
import { success } from '@lumpcode/core';

import type { LumpJsConfig } from '../../types/LumpJsConfig';
import type { LocalConfig } from '../../types/LocalConfig';
import { resolveEffectiveDiscoveryBranch } from '../resolveEffectiveDiscoveryBranch';
import { resolveLumpBaseBranch } from '../resolveLumpBranches';
import { resolvePrimaryBranch } from '../resolvePrimaryBranches';

/**
 * Base branch for an inspect command: lump `baseBranch` when it is a string,
 * otherwise the concrete discovery branch, otherwise `primaryBranch`.
 */
export async function resolveInspectBaseBranch(input: {
    lumpName: string;
    lumpConfig: Pick<LumpJsConfig, 'baseBranch' | 'discoveryBranch' | 'discoveryBranches'>;
    localConfig: LocalConfig;
    localConfigFolderPath: string;
    discoveryBranchOpt?: string;
}): Promise<Success<string> | Failure<string>> {
    const { lumpName, lumpConfig, localConfig, localConfigFolderPath, discoveryBranchOpt } = input;

    const discoveryResult = await resolveEffectiveDiscoveryBranch({
        discoveryBranchOpt,
        lumpName,
        localConfigFolderPath,
        localConfig,
        honorDiscoveryBranchOptInShared: true,
    });
    if (!discoveryResult.success) {
        return discoveryResult;
    }

    return success(
        resolveLumpBaseBranch({
            lumpConfig,
            primaryBranch: resolvePrimaryBranch(localConfig),
            mode: localConfig.mode,
            effectiveDiscoveryBranch: discoveryResult.data,
        }),
    );
}
