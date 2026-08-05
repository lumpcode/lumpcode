import type { Failure, Success } from '../../types';
import { failure, success } from '../../utils';
import { execAsync } from '../execAsync';

export type RefreshRemoteTrackingRefsFn = (input: {
    projectRoot: string;
    remoteName?: string;
}) => Promise<Success<void> | Failure<string>>;

/**
 * Refreshes remote-tracking refs for status / planning (one network fetch).
 * Uses `--no-write-fetch-head` so concurrent preflight/pull paths are safer.
 */
export const refreshRemoteTrackingRefs: RefreshRemoteTrackingRefsFn = async (input) => {
    const { projectRoot, remoteName = 'origin' } = input;
    const result = await execAsync(
        `git fetch --prune --no-write-fetch-head ${remoteName}`,
        { cwd: projectRoot },
    );
    if (!result.success) {
        return failure(result.data.message);
    }
    return success(undefined);
};
