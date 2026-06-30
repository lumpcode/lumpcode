import type { LumpJsConfig } from '../../types/LumpJsConfig';
import type { LocalConfig } from '../../types/LocalConfig';
import type { Mode } from '../../types/Mode';
import { resolvePrimaryBranch } from '../resolvePrimaryBranches';

export function resolveLumpDiscoveryBranch(input: {
    lumpConfig: Pick<LumpJsConfig, 'discoveryBranch'>;
    primaryBranch: string;
    mode?: Mode;
}): string {
    if (input.mode === 'shared') {
        return input.primaryBranch;
    }
    return input.lumpConfig.discoveryBranch ?? input.primaryBranch;
}

export function resolveLumpBaseBranch(input: {
    lumpConfig: Pick<LumpJsConfig, 'baseBranch' | 'discoveryBranch'>;
    primaryBranch: string;
    mode?: Mode;
}): string {
    const { lumpConfig, primaryBranch, mode } = input;
    if (lumpConfig.baseBranch !== undefined) {
        return lumpConfig.baseBranch;
    }
    if (mode !== 'shared' && lumpConfig.discoveryBranch !== undefined) {
        return lumpConfig.discoveryBranch;
    }
    return primaryBranch;
}

export function resolveLumpBranches(input: {
    lumpConfig: Pick<LumpJsConfig, 'baseBranch' | 'discoveryBranch'>;
    localConfig: LocalConfig;
}): { resolvedDiscoveryBranch: string; resolvedBaseBranch: string } {
    const primaryBranch = resolvePrimaryBranch(input.localConfig);
    const mode = input.localConfig.mode;
    const resolvedDiscoveryBranch = resolveLumpDiscoveryBranch({
        lumpConfig: input.lumpConfig,
        primaryBranch,
        mode,
    });
    const resolvedBaseBranch = resolveLumpBaseBranch({
        lumpConfig: input.lumpConfig,
        primaryBranch,
        mode,
    });
    return { resolvedDiscoveryBranch, resolvedBaseBranch };
}
