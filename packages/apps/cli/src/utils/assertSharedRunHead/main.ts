import type { Failure, Success } from '@lumpcode/core';

export const SHARED_RUN_DETACHED_HEAD_MESSAGE = 'Not on a branch. Shared run needs a named branch.';

export type AssertSharedRunHeadSuccess = {
    branchName: string;
};

export type AssertSharedRunHeadFailure = {
    code: 'detachedHead';
    message: string;
};

/**
 * Shared `run` gate: named-branch HEAD, or Failure `detachedHead`.
 * Dirty / staged / ignored-only porcelain is not a fail.
 */
export async function assertSharedRunHead(_input: {
    cwd: string;
}): Promise<Success<AssertSharedRunHeadSuccess> | Failure<AssertSharedRunHeadFailure>> {
    throw new Error('not implemented');
}
