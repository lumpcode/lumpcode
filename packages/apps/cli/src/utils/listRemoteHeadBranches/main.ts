import type { Failure, Success } from '@lumpcode/core';
import { execAsync, failure, shellSingleQuote, success } from '@lumpcode/core';

import { REFS_HEADS_PREFIX } from '../../consts';

export type ListRemoteHeadBranchesFailure = {
    message: string;
    reason: 'timeout' | 'exit';
};

/**
 * Lists short branch names from `git ls-remote --heads origin`.
 * Expected failures (no origin, network, timeout) return `Failure` — never throw.
 */
export async function listRemoteHeadBranches(input: {
    cwd: string;
    /** Branch glob without `refs/heads/` (e.g. `lump/my-lump/*`). */
    branchGlob: string;
    /** When set, keep only short names for which this returns true. */
    postFilterBranchShortName?: (shortName: string) => boolean;
    timeoutMillis?: number;
}): Promise<Success<string[]> | Failure<ListRemoteHeadBranchesFailure>> {
    const { cwd, branchGlob, postFilterBranchShortName, timeoutMillis } = input;
    const result = await execAsync(
        `git ls-remote --heads origin ${shellSingleQuote(`${REFS_HEADS_PREFIX}${branchGlob}`)}`,
        {
            cwd,
            ...(timeoutMillis !== undefined ? { timeoutMillis } : {}),
        },
    );
    if (!result.success) {
        return failure({
            message: result.data.message,
            reason: result.data.reason,
        });
    }

    const seen = new Set<string>();
    const names: string[] = [];
    for (const line of result.data.stdout.trim().split('\n').filter(Boolean)) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 2) continue;
        const ref = parts[1]!;
        if (!ref.startsWith(REFS_HEADS_PREFIX)) continue;
        const shortName = ref.slice(REFS_HEADS_PREFIX.length);
        if (
            (postFilterBranchShortName !== undefined && !postFilterBranchShortName(shortName)) ||
            seen.has(shortName)
        ) {
            continue;
        }
        seen.add(shortName);
        names.push(shortName);
    }
    return success(names);
}
