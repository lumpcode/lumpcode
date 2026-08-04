import type { Logger } from '@lumpcode/core';

import type { LocalConfig } from '../../types/LocalConfig';
import { isGitRefGlob } from '../isGitRefGlob';

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

/** Configured effective list (exact + glob strings); does not expand remotes. */
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

/**
 * Primary = first **exact** entry in the effective list.
 * Throws when the effective list has no exact branch (all-glob).
 */
export function resolvePrimaryBranch(localConfig: LocalConfig, logger?: Pick<Logger, 'warn'>): string {
    const branches = resolvePrimaryBranches(localConfig, logger);
    const firstExact = branches.find((b) => !isGitRefGlob(b));
    if (firstExact === undefined) {
        throw new Error(
            'local.json primaryBranches/primaryBranch must include at least one exact branch name (not only globs)',
        );
    }
    return firstExact;
}
