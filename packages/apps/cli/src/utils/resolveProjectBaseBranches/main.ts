import type { LocalConfig } from '../../types/LocalConfig';

export function resolveProjectBaseBranches(localConfig: LocalConfig): string[] {
    const branches = localConfig.projectBaseBranches;
    if (branches !== undefined && branches.length > 0) {
        return [...branches];
    }
    if (localConfig.projectBaseBranch !== undefined) {
        return [localConfig.projectBaseBranch];
    }
    return [];
}

export function resolvePrimaryProjectBaseBranch(localConfig: LocalConfig): string {
    if (localConfig.projectBaseBranch !== undefined) {
        return localConfig.projectBaseBranch;
    }
    return resolveProjectBaseBranches(localConfig)[0]!;
}
