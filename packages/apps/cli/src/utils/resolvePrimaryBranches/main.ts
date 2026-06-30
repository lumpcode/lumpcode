import type { Logger } from '@lumpcode/core';

import type { LocalConfig } from '../../types/LocalConfig';

const DEPRECATED_PROJECT_BASE_BRANCH =
    'local.json projectBaseBranch is deprecated; use primaryBranch or primaryBranches instead.';

const deprecatedWarnedConfigs = new WeakSet<LocalConfig>();

function warnDeprecatedProjectBaseBranch(localConfig: LocalConfig, logger?: Pick<Logger, 'warn'>) {
    if (
        localConfig.projectBaseBranch === undefined ||
        !logger ||
        deprecatedWarnedConfigs.has(localConfig)
    ) {
        return;
    }
    deprecatedWarnedConfigs.add(localConfig);
    logger.warn(DEPRECATED_PROJECT_BASE_BRANCH);
}

export function resolvePrimaryBranches(localConfig: LocalConfig, logger?: Pick<Logger, 'warn'>): string[] {
    warnDeprecatedProjectBaseBranch(localConfig, logger);

    if (localConfig.primaryBranches !== undefined && localConfig.primaryBranches.length > 0) {
        return [...localConfig.primaryBranches];
    }
    if (localConfig.primaryBranch !== undefined) {
        return [localConfig.primaryBranch];
    }
    if (localConfig.projectBaseBranch !== undefined) {
        return [localConfig.projectBaseBranch];
    }
    throw new Error('local config has no primaryBranch or primaryBranches');
}

export function resolvePrimaryBranch(localConfig: LocalConfig, logger?: Pick<Logger, 'warn'>): string {
    return resolvePrimaryBranches(localConfig, logger)[0]!;
}
