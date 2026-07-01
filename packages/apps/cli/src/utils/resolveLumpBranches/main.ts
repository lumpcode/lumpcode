import type { LumpJsConfig } from '../../types/LumpJsConfig';
import type { LocalConfig } from '../../types/LocalConfig';
import type { Mode } from '../../types/Mode';
import { resolvePrimaryDiscoveryBranch } from '../resolveDiscoveryBranches';

export function resolveLumpDiscoveryBranch(input: {
    lumpConfig: Pick<LumpJsConfig, 'discoveryBranch'>;
    primaryDiscoveryBranch: string;
    mode?: Mode;
}): string {
    if (input.mode === 'shared') {
        return input.primaryDiscoveryBranch;
    }
    return input.lumpConfig.discoveryBranch ?? input.primaryDiscoveryBranch;
}

export function resolveLumpBaseBranch(input: {
    lumpConfig: Pick<LumpJsConfig, 'baseBranch' | 'discoveryBranch'>;
    primaryDiscoveryBranch: string;
    projectJsonBaseBranch?: string;
    mode?: Mode;
}): string {
    const { lumpConfig, primaryDiscoveryBranch, projectJsonBaseBranch, mode } = input;
    if (lumpConfig.baseBranch !== undefined) {
        return lumpConfig.baseBranch;
    }
    if (mode !== 'shared' && lumpConfig.discoveryBranch !== undefined) {
        return lumpConfig.discoveryBranch;
    }
    if (projectJsonBaseBranch !== undefined) {
        return projectJsonBaseBranch;
    }
    return primaryDiscoveryBranch;
}

export function resolveLumpBranches(input: {
    lumpConfig: Pick<LumpJsConfig, 'baseBranch' | 'discoveryBranch'>;
    localConfig: LocalConfig;
    projectJsonBaseBranch?: string;
}): { resolvedDiscoveryBranch: string; resolvedBaseBranch: string } {
    const primaryDiscoveryBranch = resolvePrimaryDiscoveryBranch(input.localConfig);
    const mode = input.localConfig.mode;
    const resolvedDiscoveryBranch = resolveLumpDiscoveryBranch({
        lumpConfig: input.lumpConfig,
        primaryDiscoveryBranch,
        mode,
    });
    const resolvedBaseBranch = resolveLumpBaseBranch({
        lumpConfig: input.lumpConfig,
        primaryDiscoveryBranch,
        projectJsonBaseBranch: input.projectJsonBaseBranch,
        mode,
    });
    return { resolvedDiscoveryBranch, resolvedBaseBranch };
}
