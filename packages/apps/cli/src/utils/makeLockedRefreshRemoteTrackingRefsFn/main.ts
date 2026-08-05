import {
    failure,
    refreshRemoteTrackingRefs,
    type Failure,
    type RefreshRemoteTrackingRefsFn,
    type Success,
} from '@lumpcode/core';

import {
    type GitCommonDirLockContext,
    withGitCommonDirLock,
} from '../gitCommonDirLock';

/**
 * One locked `git fetch --prune --no-write-fetch-head` for context-status refresh.
 * Uses `projectRoot` from the refresh call as `gitCwd` (overrides lock default).
 */
export function makeLockedRefreshRemoteTrackingRefsFn(input: {
    gitLock: GitCommonDirLockContext;
}): RefreshRemoteTrackingRefsFn {
    const { gitLock } = input;

    return async ({ projectRoot, remoteName }) => {
        const locked = await withGitCommonDirLock({
            lock: { ...gitLock, gitCwd: projectRoot },
            fn: async (): Promise<Success<void> | Failure<string>> =>
                refreshRemoteTrackingRefs({ projectRoot, remoteName }),
        });
        if (!locked.success) {
            return failure(
                typeof locked.data === 'string' ? locked.data : locked.data.message,
            );
        }
        return locked.data;
    };
}
