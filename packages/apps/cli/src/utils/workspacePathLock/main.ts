import { type Failure, type Success } from '@lumpcode/core';

import {
    acquireWorkspaceFileLock,
    formatWorkspaceFileWaitMessage,
    isWorkspaceFileBusyError,
    workspaceLockFilePath,
    workspaceLocksDirPath,
    type ReleaseWorkspaceFileLockFn,
    type WorkspaceFileBusyError,
    type WorkspaceLockMode,
    type WorkspaceFileLockSpec,
} from '../workspaceFileLock';

const WORKSPACE_PATH_LOCK_SPEC = {
    locksSubdirName: 'workspace-path-locks',
    busyCode: 'workspacePathBusy',
    workspacePathField: 'workspacePath',
    workspaceLabel: 'Workspace path',
    waitLogNoun: 'workspace path',
    staleLogNoun: 'workspace path lock',
} as const satisfies WorkspaceFileLockSpec;

export type WorkspacePathBusyError = WorkspaceFileBusyError<typeof WORKSPACE_PATH_LOCK_SPEC>;

export type WorkspacePathLockHolder = {
    pid: number;
    lumpName: string;
    workspacePath: string;
    startedAt: string;
    projectName?: string;
};

export type ReleaseWorkspacePathLockFn = ReleaseWorkspaceFileLockFn;

export type WorkspacePathLockMode = WorkspaceLockMode;

export function workspacePathLocksDirPath(input: { globalConfigFolderPath: string }): string {
    return workspaceLocksDirPath({
        globalConfigFolderPath: input.globalConfigFolderPath,
        spec: WORKSPACE_PATH_LOCK_SPEC,
    });
}

export function workspacePathLockFilePath(input: {
    globalConfigFolderPath: string;
    workspacePath: string;
}): string {
    return workspaceLockFilePath({
        globalConfigFolderPath: input.globalConfigFolderPath,
        workspacePath: input.workspacePath,
        spec: WORKSPACE_PATH_LOCK_SPEC,
    });
}

export function isWorkspacePathBusyError(data: unknown): data is WorkspacePathBusyError {
    return isWorkspaceFileBusyError(data, WORKSPACE_PATH_LOCK_SPEC.busyCode);
}

export function formatWorkspacePathWaitMessage(input: {
    workspacePath: string;
    holder?: WorkspacePathLockHolder;
}): string {
    return formatWorkspaceFileWaitMessage({
        spec: WORKSPACE_PATH_LOCK_SPEC,
        workspacePath: input.workspacePath,
        holder: input.holder,
    });
}

export async function acquireWorkspacePathLock(input: {
    globalConfigFolderPath: string;
    workspacePath: string;
    lumpName: string;
    mode: WorkspacePathLockMode;
    projectName?: string;
    logger?: Parameters<typeof acquireWorkspaceFileLock>[0]['logger'];
    waitTimeoutMs?: number;
    waitLogIntervalMs?: number;
}): Promise<Success<ReleaseWorkspacePathLockFn> | Failure<WorkspacePathBusyError>> {
    return acquireWorkspaceFileLock({
        spec: WORKSPACE_PATH_LOCK_SPEC,
        globalConfigFolderPath: input.globalConfigFolderPath,
        workspacePath: input.workspacePath,
        lumpName: input.lumpName,
        mode: input.mode,
        projectName: input.projectName,
        logger: input.logger,
        waitTimeoutMs: input.waitTimeoutMs,
        waitLogIntervalMs: input.waitLogIntervalMs,
    });
}
