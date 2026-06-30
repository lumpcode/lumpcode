import type { LocalConfig } from '../../types/LocalConfig';

export function resolvePrimaryBranches(localConfig: LocalConfig): string[] {
    if (localConfig.primaryBranches !== undefined && localConfig.primaryBranches.length > 0) {
        return [...localConfig.primaryBranches];
    }
    if (localConfig.primaryBranch !== undefined) {
        return [localConfig.primaryBranch];
    }
    throw new Error('local config has no primaryBranch or primaryBranches');
}

export function resolvePrimaryBranch(localConfig: LocalConfig): string {
    return resolvePrimaryBranches(localConfig)[0]!;
}
