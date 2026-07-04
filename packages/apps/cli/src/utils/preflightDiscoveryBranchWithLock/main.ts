import type { Failure, Logger, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import type { LocalConfig } from '../../types/LocalConfig';
import type { WorkspaceStrategy } from '../../types/WorkspaceStrategy';
import { getExecutionWorkspacePath } from '../getExecutionWorkspacePath';
import { getProjectName } from '../getProjectName';
import { runProjectPreflight } from '../runProjectPreflight';
import {
    acquireWorkspacePathLock,
    type ReleaseWorkspacePathLockFn,
    type WorkspacePathBusyError,
} from '../workspacePathLock';
import type { WorkspaceLockMode } from '../workspaceFileLock';

export async function preflightDiscoveryBranchWithLock<T>(input: {
    sourceProjectRoot: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    localConfig: LocalConfig;
    discoveryBranch: string;
    lumpName: string;
    lockMode: WorkspaceLockMode;
    projectName?: string;
    logger?: Logger;
    holdForRun: boolean;
    workspaceStrategy?: WorkspaceStrategy;
    fn: () => Promise<Success<T> | Failure<string>>;
}): Promise<
    | Success<{ data: T; releaseLock?: ReleaseWorkspacePathLockFn; executionWorkspacePath: string }>
    | Failure<string | WorkspacePathBusyError>
> {
    const {
        sourceProjectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
        localConfig,
        discoveryBranch,
        lumpName,
        lockMode,
        projectName: projectNameInput,
        logger,
        holdForRun,
        workspaceStrategy = localConfig.workspaceStrategy ?? 'checkout',
        fn,
    } = input;

    if (localConfig.mode !== 'dedicated') {
        return failure('preflightDiscoveryBranchWithLock is dedicated-only');
    }

    const projectNameResult = await getProjectName({
        localConfigFolderPath,
        projectRoot: sourceProjectRoot,
    });
    if (!projectNameResult.success) {
        return failure(projectNameResult.data);
    }
    const projectName = projectNameInput ?? projectNameResult.data;

    const executionWorkspacePath = getExecutionWorkspacePath({
        mode: localConfig.mode,
        sourceProjectRoot,
        globalConfigFolderPath,
        projectName,
    });

    const lockResult = await acquireWorkspacePathLock({
        globalConfigFolderPath,
        workspacePath: executionWorkspacePath,
        lumpName,
        mode: lockMode,
        projectName,
        logger,
    });
    if (!lockResult.success) {
        return failure(lockResult.data);
    }

    const releaseLock = lockResult.data;

    const releaseAndFail = async (message: string): Promise<Failure<string>> => {
        await releaseLock();
        return failure(message);
    };

    const preflightResult = await runProjectPreflight({
        sourceProjectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
        localConfig,
        targetBranch: discoveryBranch,
    });
    if (!preflightResult.success) {
        return releaseAndFail(preflightResult.data);
    }

    const fnResult = await fn();
    if (!fnResult.success) {
        return releaseAndFail(fnResult.data);
    }

    const keepLockForRun = holdForRun && workspaceStrategy === 'checkout';

    if (!keepLockForRun) {
        await releaseLock();
        return success({
            data: fnResult.data,
            executionWorkspacePath: preflightResult.data.executionWorkspacePath,
        });
    }

    return success({
        data: fnResult.data,
        releaseLock,
        executionWorkspacePath: preflightResult.data.executionWorkspacePath,
    });
}
