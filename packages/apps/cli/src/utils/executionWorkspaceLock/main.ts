import { type Failure, type Success } from '@lumpcode/core';

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

const EXECUTION_WORKSPACE_LOCK_SPEC = {
    locksSubdirName: 'execution-workspace-locks',
    busyCode: 'executionWorkspaceBusy',
    workspacePathField: 'executionWorkspacePath',
    workspaceLabel: 'Execution workspace',
    waitLogNoun: 'execution workspace',
    staleLogNoun: 'execution workspace lock',
} as const satisfies WorkspaceFileLockSpec;

export type ExecutionWorkspaceBusyError = WorkspaceFileBusyError<typeof EXECUTION_WORKSPACE_LOCK_SPEC>;

export type ExecutionWorkspaceLockHolder = {
    pid: number;
    lumpName: string;
    executionWorkspacePath: string;
    startedAt: string;
    projectName?: string;
};

export type ReleaseExecutionWorkspaceLockFn = () => Promise<void>;

export type ExecutionWorkspaceLockMode = WorkspaceLockMode;

export function executionWorkspaceLocksDirPath(input: { globalConfigFolderPath: string }): string {
    return workspaceLocksDirPath({
        globalConfigFolderPath: input.globalConfigFolderPath,
        spec: EXECUTION_WORKSPACE_LOCK_SPEC,
    });
}

export function executionWorkspaceLockFilePath(input: {
    globalConfigFolderPath: string;
    executionWorkspacePath: string;
}): string {
    return workspaceLockFilePath({
        globalConfigFolderPath: input.globalConfigFolderPath,
        workspacePath: input.executionWorkspacePath,
        spec: EXECUTION_WORKSPACE_LOCK_SPEC,
    });
}

export function isExecutionWorkspaceBusyError(data: unknown): data is ExecutionWorkspaceBusyError {
    return isWorkspaceFileBusyError(data, EXECUTION_WORKSPACE_LOCK_SPEC.busyCode);
}

export function formatExecutionWorkspaceWaitMessage(input: {
    executionWorkspacePath: string;
    holder?: ExecutionWorkspaceLockHolder;
}): string {
    return formatWorkspaceFileWaitMessage({
        spec: EXECUTION_WORKSPACE_LOCK_SPEC,
        workspacePath: input.executionWorkspacePath,
        holder: input.holder,
    });
}

export async function acquireExecutionWorkspaceLock(input: {
    globalConfigFolderPath: string;
    executionWorkspacePath: string;
    lumpName: string;
    mode: ExecutionWorkspaceLockMode;
    projectName?: string;
    logger?: Parameters<typeof acquireWorkspaceFileLock>[0]['logger'];
}): Promise<Success<ReleaseExecutionWorkspaceLockFn> | Failure<ExecutionWorkspaceBusyError>> {
    return acquireWorkspaceFileLock({
        spec: EXECUTION_WORKSPACE_LOCK_SPEC,
        globalConfigFolderPath: input.globalConfigFolderPath,
        workspacePath: input.executionWorkspacePath,
        lumpName: input.lumpName,
        mode: input.mode,
        projectName: input.projectName,
        logger: input.logger,
    });
}
