import type { Failure, Success } from '@lumpcode/core';

import type { ValidateLumpBaseBranchAllowlistInput } from '../../types/ValidateLumpBaseBranchAllowlistInput';

export function validateLumpBaseBranchAllowlist(
    _input: ValidateLumpBaseBranchAllowlistInput,
): Success<void> | Failure<string> {
    throw new Error('not implemented');
}
