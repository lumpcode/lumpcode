import { execAsync, failure, success, type Failure, type Success } from '@lumpcode/core';

export type AssertSourceWorkTreeCleanFailure = {
    code: 'dirtyWorkTree' | 'detachedHead';
    message: string;
};

const DIRTY_MESSAGE =
    'Working tree is dirty. Commit or stash before lumpcode run in shared mode.';
const DETACHED_MESSAGE =
    'Not on a branch. Shared run needs a named branch to commit and push.';

/**
 * Shared-mode pre-run gate: porcelain must be empty and HEAD must be a named branch.
 */
export async function assertSourceWorkTreeClean(input: {
    cwd: string;
}): Promise<Success<{ branchName: string }> | Failure<AssertSourceWorkTreeCleanFailure>> {
    const { cwd } = input;

    const statusResult = await execAsync('git status --porcelain', { cwd });
    if (!statusResult.success || statusResult.data.stdout.trim() !== '') {
        return failure({ code: 'dirtyWorkTree' as const, message: DIRTY_MESSAGE });
    }

    const headResult = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd });
    const branchName = headResult.success ? headResult.data.stdout.trim() : '';
    if (!headResult.success || branchName === '' || branchName === 'HEAD') {
        return failure({ code: 'detachedHead' as const, message: DETACHED_MESSAGE });
    }

    return success({ branchName });
}
