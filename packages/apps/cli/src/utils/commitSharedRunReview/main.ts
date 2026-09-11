import type { Failure, Success } from '@lumpcode/core';

export type CommitSharedRunReviewFailure = {
    code: 'sharedRunCommitFailed';
    message: string;
};

/**
 * One `git add .` + `--allow-empty` commit at `cwd` with every context marker.
 * No push. Failure `sharedRunCommitFailed` carries git stderr.
 */
export async function commitSharedRunReview(_input: {
    cwd: string;
    lumpName: string;
    contextNames: string[];
}): Promise<Success<void> | Failure<CommitSharedRunReviewFailure>> {
    throw new Error('not implemented');
}
