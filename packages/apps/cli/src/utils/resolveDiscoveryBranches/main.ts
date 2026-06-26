import type { LocalConfig } from '../../types/LocalConfig';

export function resolveDiscoveryBranches(localConfig: LocalConfig): string[] {
    if (localConfig.discoveryBranches !== undefined && localConfig.discoveryBranches.length > 0) {
        return [...localConfig.discoveryBranches];
    }
    if (localConfig.discoveryBranch !== undefined) {
        return [localConfig.discoveryBranch];
    }
    throw new Error('local config has no discoveryBranch or discoveryBranches');
}

export function resolvePrimaryDiscoveryBranch(localConfig: LocalConfig): string {
    return resolveDiscoveryBranches(localConfig)[0]!;
}
