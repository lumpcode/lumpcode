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

const BRANCH_WORKSPACE_LOCK_SPEC = {
    locksSubdirName: 'branch-workspace-locks',
    busyCode: 'branchWorkspaceBusy',
    workspacePathField: 'branchWorkspacePath',
    workspaceLabel: 'Branch workspace',
    waitLogNoun: 'branch workspace',
    staleLogNoun: 'branch workspace lock',
} as const satisfies WorkspaceFileLockSpec;

export type BranchWorkspaceBusyError = WorkspaceFileBusyError<typeof BRANCH_WORKSPACE_LOCK_SPEC>;

export type BranchWorkspaceLockHolder = {
    pid: number;
    lumpName: string;
    branchWorkspacePath: string;
    startedAt: string;
    projectName?: string;
};

export type ReleaseBranchWorkspaceLockFn = () => Promise<void>;

export function branchWorkspaceLocksDirPath(input: { globalConfigFolderPath: string }): string {
    return workspaceLocksDirPath({
        globalConfigFolderPath: input.globalConfigFolderPath,
        spec: BRANCH_WORKSPACE_LOCK_SPEC,
    });
}

export function branchWorkspaceLockFilePath(input: {
    globalConfigFolderPath: string;
    branchWorkspacePath: string;
}): string {
    return workspaceLockFilePath({
        globalConfigFolderPath: input.globalConfigFolderPath,
        workspacePath: input.branchWorkspacePath,
        spec: BRANCH_WORKSPACE_LOCK_SPEC,
    });
}

export function isBranchWorkspaceBusyError(data: unknown): data is BranchWorkspaceBusyError {
    return isWorkspaceFileBusyError(data, BRANCH_WORKSPACE_LOCK_SPEC.busyCode);
}

export function formatBranchWorkspaceWaitMessage(input: {
    branchWorkspacePath: string;
    holder?: BranchWorkspaceLockHolder;
}): string {
    return formatWorkspaceFileWaitMessage({
        spec: BRANCH_WORKSPACE_LOCK_SPEC,
        workspacePath: input.branchWorkspacePath,
        holder: input.holder,
    });
}

export async function acquireBranchWorkspaceLock(input: {
    globalConfigFolderPath: string;
    branchWorkspacePath: string;
    lumpName: string;
    mode: BranchWorkspaceLockMode;
    projectName?: string;
    logger?: Parameters<typeof acquireWorkspaceFileLock>[0]['logger'];
}): Promise<Success<ReleaseBranchWorkspaceLockFn> | Failure<BranchWorkspaceBusyError>> {
    return acquireWorkspaceFileLock({
        spec: BRANCH_WORKSPACE_LOCK_SPEC,
        globalConfigFolderPath: input.globalConfigFolderPath,
        workspacePath: input.branchWorkspacePath,
        lumpName: input.lumpName,
        mode: input.mode,
        projectName: input.projectName,
        logger: input.logger,
    });
}

export type BranchWorkspaceLockMode = WorkspaceLockMode;
