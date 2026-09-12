import { execAsync, failure, success, type Failure, type Success } from '@lumpcode/core';

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
export async function assertSharedRunHead(input: {
    cwd: string;
}): Promise<Success<AssertSharedRunHeadSuccess> | Failure<AssertSharedRunHeadFailure>> {
    const detached = failure({
        code: 'detachedHead' as const,
        message: SHARED_RUN_DETACHED_HEAD_MESSAGE,
    });

    const headResult = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: input.cwd });
    if (!headResult.success) {
        return detached;
    }

    const branchName = headResult.data.stdout.trim();
    if (!branchName || branchName === 'HEAD') {
        return detached;
    }

    return success({ branchName });
}
