import type { Failure, Logger, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

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
 * Expand order: configured-entry order — exact entries first-as-listed, then
 * each glob's hits in ls-remote/dedupe order.
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

        let heads: string[];
        try {
            heads = await listRemoteHeadBranches({ cwd, branchGlob: entry });
        } catch (err) {
            const detail = err instanceof Error ? err.message : String(err);
            return failure(
                `Failed to expand primaryBranches glob "${entry}" via ls-remote: ${detail}`,
            );
        }

        if (heads.length === 0) {
            logger?.info(
                `primaryBranches glob "${entry}" matched no remote heads; skipping.`,
            );
            continue;
        }

        for (const head of heads) {
            if (!seen.has(head)) {
                seen.add(head);
                concrete.push(head);
            }
        }
    }

    return success(concrete);
}
