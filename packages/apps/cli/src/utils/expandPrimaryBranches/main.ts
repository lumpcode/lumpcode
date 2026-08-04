import type { Failure, Logger, Success } from '@lumpcode/core';

import type { LocalConfig } from '../../types/LocalConfig';

export type ExpandPrimaryBranchesInput = {
    localConfig: LocalConfig;
    cwd: string;
    logger?: Pick<Logger, 'info' | 'warn'>;
};

/**
 * Dedicated mode: expand configured `primaryBranches` (exact + git globs) to a
 * concrete, deduped scan list via `listRemoteHeadBranches` / `git ls-remote`.
 * Exact entries are kept as-is even when missing on the remote.
 *
 * Shared mode: do not expand globs for scan fan-out (exact primary only).
 *
 * Stub for dynamic-discovery-branch — implement during feature stage.
 */
export async function expandPrimaryBranches(
    _input: ExpandPrimaryBranchesInput,
): Promise<Success<string[]> | Failure<string>> {
    throw new Error('not implemented');
}
