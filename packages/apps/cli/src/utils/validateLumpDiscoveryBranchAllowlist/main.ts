import type { Failure, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import type { ValidateLumpDiscoveryBranchAllowlistInput } from '../../types/ValidateLumpDiscoveryBranchAllowlistInput';
import { branchMatchesGitGlob } from '../branchMatchesGitGlob';
import { isGitRefGlob } from '../isGitRefGlob';

/**
 * Dedicated allowlist: a discovery rule or concrete flag is allowed against
 * **unexpanded** `primaryBranches`:
 * - Exact value: equals an exact primary entry, or matches a primary glob pattern
 * - Pattern value: equals some primaryBranches entry (typically the same glob string)
 */
export function isDiscoveryBranchAllowedByPrimaries(input: {
    discoveryBranch: string;
    effectivePrimaryBranches: string[];
}): boolean {
    const { discoveryBranch, effectivePrimaryBranches } = input;

    if (effectivePrimaryBranches.includes(discoveryBranch)) {
        return true;
    }

    if (isGitRefGlob(discoveryBranch)) {
        return false;
    }

    return effectivePrimaryBranches.some(
        (primary) =>
            isGitRefGlob(primary) &&
            branchMatchesGitGlob({ pattern: primary, branch: discoveryBranch }),
    );
}

export function validateLumpDiscoveryBranchAllowlist(
    input: ValidateLumpDiscoveryBranchAllowlistInput,
): Success<void> | Failure<string> {
    if (input.mode === 'shared') {
        return success(undefined);
    }

    if (
        isDiscoveryBranchAllowedByPrimaries({
            discoveryBranch: input.resolvedDiscoveryBranch,
            effectivePrimaryBranches: input.effectivePrimaryBranches,
        })
    ) {
        return success(undefined);
    }

    return failure(
        `Lump "${input.lumpName}" discoveryBranch "${input.resolvedDiscoveryBranch}" is not listed in ` +
            `local.json primaryBranches (allowed: ${input.effectivePrimaryBranches.join(', ')})`,
    );
}
