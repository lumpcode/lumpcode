import { failure, type Failure, success, type Success } from '@lumpcode/core';

import type { Mode } from '../../types/Mode';
import type { WorkspaceStrategy } from '../../types/WorkspaceStrategy';
import { getExecutionWorkspacePath } from '../getExecutionWorkspacePath';
import { getProjectName } from '../getProjectName';
import { readLocalConfig } from '../readLocalConfig';
import { resolvePrimaryDiscoveryBranch } from '../resolveDiscoveryBranches';

export interface ResolveProjectExecutionContextInput {
    sourceProjectRoot: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
}

export interface ResolveProjectExecutionContextOutput {
    executionWorkspacePath: string;
    projectBaseBranch: string;
    mode: Mode;
    workspaceStrategy: WorkspaceStrategy;
}

/**
 * Resolves execution workspace path and local.json settings without running
 * destructive pre-flight (no copy creation, fetch, or reset).
 */
export async function resolveProjectExecutionContext(
    input: ResolveProjectExecutionContextInput,
): Promise<Success<ResolveProjectExecutionContextOutput> | Failure<string>> {
    const { sourceProjectRoot, localConfigFolderPath, globalConfigFolderPath } = input;

    const localConfigResult = await readLocalConfig({ localConfigFolderPath });
    if (!localConfigResult.success) return localConfigResult;
    const { mode, workspaceStrategy = 'checkout' } = localConfigResult.data;
    const projectBaseBranch = resolvePrimaryDiscoveryBranch(localConfigResult.data);

    const projectNameResult = await getProjectName({
        localConfigFolderPath,
        projectRoot: sourceProjectRoot,
    });
    if (!projectNameResult.success) return projectNameResult;

    const executionWorkspacePath = getExecutionWorkspacePath({
        mode,
        sourceProjectRoot,
        globalConfigFolderPath,
        projectName: projectNameResult.data,
    });

    return success({
        executionWorkspacePath,
        projectBaseBranch,
        mode,
        workspaceStrategy,
    });
}
