import {
    getContextStatus as getContextStatusCore,
    type ContextStatus,
} from '@lumpcode/core';

import { globalConfigFolderPath as defaultGlobalConfigFolderPath } from '../../constants/globalConfigFolderPath';
import { makeGitCommitMessageFnFromLumpName } from '../makeGitCommitMessageFnFromLumpName';
import { makeLockedRefreshRemoteTrackingRefsFn } from '../makeLockedRefreshRemoteTrackingRefsFn';
import type { ContextStatusRecordItem } from '../../types';

export async function getContextStatuses(input: {
    projectRoot: string;
    lumpName: string;
    baseBranch: string;
    contextNames: string[];
    /**
     * When true, skip the locked remote refresh and classify from existing
     * remote-tracking refs. Caller must have refreshed already when freshness matters.
     */
    skipRefresh?: boolean;
}): Promise<Map<string, ContextStatus>> {
    const { projectRoot, lumpName, baseBranch, contextNames, skipRefresh = false } = input;
    const uniqueNames = [...new Set(contextNames)];
    const gitCommitMessageFn = makeGitCommitMessageFnFromLumpName(lumpName);

    if (!skipRefresh) {
        const refreshRemoteTrackingRefsFn = makeLockedRefreshRemoteTrackingRefsFn({
            gitLock: {
                globalConfigFolderPath: defaultGlobalConfigFolderPath,
                gitCwd: projectRoot,
                lumpName,
                lockMode: 'wait',
            },
        });

        const refreshResult = await refreshRemoteTrackingRefsFn({ projectRoot });
        if (!refreshResult.success) {
            return new Map(uniqueNames.map((name) => [name, 'toDo' as const]));
        }
    }

    const statuses = await Promise.all(
        uniqueNames.map((contextName) =>
            getContextStatusCore({
                contextName,
                gitCommitMessageFn,
                projectRoot,
                baseBranch,
                skipFetch: true,
            }),
        ),
    );

    return new Map(uniqueNames.map((name, i) => [name, statuses[i]!]));
}

export async function getContextStatus(input: {
    projectRoot: string;
    contextName: string;
    lumpName: string;
    baseBranch: string;
}): Promise<ContextStatusRecordItem['status']> {
    const { contextName, ...rest } = input;
    const statuses = await getContextStatuses({
        ...rest,
        contextNames: [contextName],
    });
    return statuses.get(contextName) ?? 'toDo';
}
