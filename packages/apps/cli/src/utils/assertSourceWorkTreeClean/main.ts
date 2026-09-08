import type { Failure, Success } from '@lumpcode/core';

export type AssertSourceWorkTreeCleanFailure = {
    code: 'dirtyWorkTree' | 'detachedHead';
    message: string;
};

/**
 * Shared-mode pre-run gate: porcelain must be empty and HEAD must be a named branch.
 * Stub until shared-in-place-run impl.
 */
export async function assertSourceWorkTreeClean(_input: {
    cwd: string;
}): Promise<Success<{ branchName: string }> | Failure<AssertSourceWorkTreeCleanFailure>> {
    throw new Error('not implemented');
}
