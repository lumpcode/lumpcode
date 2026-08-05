import { type Failure, type Logger, success, type Success } from '@lumpcode/core';

import {
    acquireWorkspaceFileLock,
    formatWorkspaceFileWaitMessage,
    isWorkspaceFileBusyError,
    workspaceLockFilePath,
    workspaceLocksDirPath,
    type WorkspaceFileBusyError,
    type WorkspaceLockMode,
    type WorkspaceFileLockSpec,
} from '../workspaceFileLock';
import { resolveGitCommonDir } from '../resolveGitCommonDir';

const GIT_COMMON_DIR_LOCK_SPEC = {
    locksSubdirName: 'git-common-dir-locks',
    busyCode: 'gitCommonDirBusy',
    workspacePathField: 'gitCommonDir',
    workspaceLabel: 'Git common dir',
    waitLogNoun: 'git common dir',
    staleLogNoun: 'git common dir lock',
} as const satisfies WorkspaceFileLockSpec;

export type GitCommonDirBusyError = WorkspaceFileBusyError<typeof GIT_COMMON_DIR_LOCK_SPEC>;

export type GitCommonDirLockHolder = {
    pid: number;
    lumpName: string;
    gitCommonDir: string;
    startedAt: string;
    projectName?: string;
};

export type ReleaseGitCommonDirLockFn = () => Promise<void>;

export type GitCommonDirLockMode = WorkspaceLockMode;

/**
 * Lock context for shared-git mutations. `gitCwd` is any path in the repo
 * (execution workspace or worktree); the common dir is resolved at acquire time.
 */
export type GitCommonDirLockContext = {
    globalConfigFolderPath: string;
    /** cwd for `git rev-parse --git-common-dir` (execution workspace or worktree). */
    gitCwd: string;
    lumpName: string;
    lockMode: GitCommonDirLockMode;
    projectName?: string;
    logger?: Logger;
};

export function gitCommonDirLocksDirPath(input: { globalConfigFolderPath: string }): string {
    return workspaceLocksDirPath({
        globalConfigFolderPath: input.globalConfigFolderPath,
        spec: GIT_COMMON_DIR_LOCK_SPEC,
    });
}

export function gitCommonDirLockFilePath(input: {
    globalConfigFolderPath: string;
    gitCommonDir: string;
}): string {
    return workspaceLockFilePath({
        globalConfigFolderPath: input.globalConfigFolderPath,
        workspacePath: input.gitCommonDir,
        spec: GIT_COMMON_DIR_LOCK_SPEC,
    });
}

export function isGitCommonDirBusyError(data: unknown): data is GitCommonDirBusyError {
    return isWorkspaceFileBusyError(data, GIT_COMMON_DIR_LOCK_SPEC.busyCode);
}

export function formatGitCommonDirWaitMessage(input: {
    gitCommonDir: string;
    holder?: GitCommonDirLockHolder;
}): string {
    return formatWorkspaceFileWaitMessage({
        spec: GIT_COMMON_DIR_LOCK_SPEC,
        workspacePath: input.gitCommonDir,
        holder: input.holder,
    });
}

export async function acquireGitCommonDirLock(
    input: GitCommonDirLockContext,
): Promise<Success<ReleaseGitCommonDirLockFn> | Failure<GitCommonDirBusyError | string>> {
    const commonDirResult = await resolveGitCommonDir({ cwd: input.gitCwd });
    if (!commonDirResult.success) {
        return commonDirResult;
    }

    return acquireWorkspaceFileLock({
        spec: GIT_COMMON_DIR_LOCK_SPEC,
        globalConfigFolderPath: input.globalConfigFolderPath,
        workspacePath: commonDirResult.data,
        lumpName: input.lumpName,
        mode: input.lockMode,
        projectName: input.projectName,
        logger: input.logger,
    });
}

/** Acquire, run `fn`, always release. */
export async function withGitCommonDirLock<T>(input: {
    lock: GitCommonDirLockContext;
    fn: () => Promise<T>;
}): Promise<Success<T> | Failure<GitCommonDirBusyError | string>> {
    const lockResult = await acquireGitCommonDirLock(input.lock);
    if (!lockResult.success) {
        return lockResult;
    }
    const releaseLock = lockResult.data;
    try {
        return success(await input.fn());
    } finally {
        await releaseLock();
    }
}
