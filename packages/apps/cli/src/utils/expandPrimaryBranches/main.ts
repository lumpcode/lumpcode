import type { Failure, Logger, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import { DISCOVERY_GIT_TIMEOUT_MS } from '../../consts';
import type { LocalConfig } from '../../types/LocalConfig';
import { isGitRefGlob } from '../isGitRefGlob';
import { listRemoteHeadBranches } from '../listRemoteHeadBranches';
import { resolvePrimaryBranch, resolvePrimaryBranches } from '../resolvePrimaryBranches';

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
 * Expand order: configured-entry order (exact as listed, then each glob's
 * ls-remote hits), then the resolved primary (first exact) is moved to index 0.
 * Remaining concrete branches keep that expand order.
 *
 * Shared mode: do not expand globs for scan fan-out (exact primary only).
 */
export async function expandPrimaryBranches(
    input: ExpandPrimaryBranchesInput,
): Promise<Success<string[]> | Failure<string>> {
    const { localConfig, cwd, logger } = input;

    try {
        // Validate ≥1 exact primary before expanding (also covers shared).
        resolvePrimaryBranch(localConfig, logger);
    } catch (err) {
        return failure(err instanceof Error ? err.message : String(err));
    }

    if (localConfig.mode === 'shared') {
        return success([resolvePrimaryBranch(localConfig, logger)]);
    }

    const configured = resolvePrimaryBranches(localConfig, logger);
    const seen = new Set<string>();
    const concrete: string[] = [];

    for (const entry of configured) {
        if (!isGitRefGlob(entry)) {
            if (!seen.has(entry)) {
                seen.add(entry);
                concrete.push(entry);
            }
            continue;
        }

        const listed = await listRemoteHeadBranches({
            cwd,
            branchGlob: entry,
            timeoutMillis: DISCOVERY_GIT_TIMEOUT_MS,
        });
        if (!listed.success && listed.data.reason === 'timeout') {
            return failure(
                `Failed to expand primaryBranches glob "${entry}" via ls-remote: ${listed.data.message}`,
            );
        }
        if (!listed.success || listed.data.length === 0) {
            logger?.info(
                `primaryBranches glob "${entry}" matched no remote heads; skipping.`,
            );
            continue;
        }

        for (const head of listed.data) {
            if (!seen.has(head)) {
                seen.add(head);
                concrete.push(head);
            }
        }
    }

    const primary = resolvePrimaryBranch(localConfig, logger);
    return success([primary, ...concrete.filter((branch) => branch !== primary)]);
}
