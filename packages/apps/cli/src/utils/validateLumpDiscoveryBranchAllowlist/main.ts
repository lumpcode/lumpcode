import type { Failure, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import type { ValidateLumpDiscoveryBranchAllowlistInput } from '../../types/ValidateLumpDiscoveryBranchAllowlistInput';

export function validateLumpDiscoveryBranchAllowlist(
    input: ValidateLumpDiscoveryBranchAllowlistInput,
): Success<void> | Failure<string> {
    if (input.mode === 'shared') {
        return success(undefined);
    }

    if (input.effectiveDiscoveryBranches.includes(input.resolvedDiscoveryBranch)) {
        return success(undefined);
    }

    return failure(
        `Lump "${input.lumpName}" discoveryBranch "${input.resolvedDiscoveryBranch}" is not listed in ` +
            `local.json discoveryBranches (allowed: ${input.effectiveDiscoveryBranches.join(', ')})`,
    );
}
