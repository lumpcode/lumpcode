import { failure, type Failure, success, type Success } from '@lumpcode/core';

import type { ValidateLumpBaseBranchAllowlistInput } from '../../types/ValidateLumpBaseBranchAllowlistInput';

export function validateLumpBaseBranchAllowlist(
    input: ValidateLumpBaseBranchAllowlistInput,
): Success<void> | Failure<string> {
    const { lumpName, resolvedBaseBranch, effectiveBranches, allowUnlistedBaseBranch } = input;

    if (allowUnlistedBaseBranch) {
        return success(undefined);
    }

    if (effectiveBranches.includes(resolvedBaseBranch)) {
        return success(undefined);
    }

    return failure(
        `Lump "${lumpName}" baseBranch "${resolvedBaseBranch}" is not in the project integration-branch allowlist ` +
            `(${effectiveBranches.join(', ')}). Set allowUnlistedBaseBranch: true to opt out.`,
    );
}
