import type { LumpJsConfig } from '../../types/LumpJsConfig';
import type { LocalConfig } from '../../types/LocalConfig';

export function resolveLumpDiscoveryBranch(input: {
    lumpConfig: Pick<LumpJsConfig, 'discoveryBranch'>;
    primaryDiscoveryBranch: string;
}): string {
    throw new Error('not implemented');
}

export function resolveLumpBaseBranch(input: {
    lumpConfig: Pick<LumpJsConfig, 'baseBranch' | 'discoveryBranch'>;
    primaryDiscoveryBranch: string;
    projectJsonBaseBranch?: string;
}): string {
    throw new Error('not implemented');
}

export function resolveLumpBranches(input: {
    lumpConfig: Pick<LumpJsConfig, 'baseBranch' | 'discoveryBranch'>;
    localConfig: LocalConfig;
    projectJsonBaseBranch?: string;
}): { resolvedDiscoveryBranch: string; resolvedBaseBranch: string } {
    throw new Error('not implemented');
}
