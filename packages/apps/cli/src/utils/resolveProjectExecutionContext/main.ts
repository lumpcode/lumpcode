import { failure, type Failure, success, type Success } from '@lumpcode/core';

import type { Mode } from '../../types/Mode';
import type { WorkspaceStrategy } from '../../types/WorkspaceStrategy';
import { getExecutionWorkspacePath } from '../getExecutionWorkspacePath';
import { readProjectLocalConfig } from '../readProjectLocalConfig';
import { resolvePrimaryBranch } from '../resolvePrimaryBranches';

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
 * Resolves execution workspace path and project/local settings without running
 * destructive pre-flight (no copy creation, fetch, or reset).
 */
export async function resolveProjectExecutionContext(
    input: ResolveProjectExecutionContextInput,
): Promise<Success<ResolveProjectExecutionContextOutput> | Failure<string>> {
    const { sourceProjectRoot, localConfigFolderPath, globalConfigFolderPath } = input;

    const resolvedResult = await readProjectLocalConfig({ localConfigFolderPath });
    if (!resolvedResult.success) return resolvedResult;
    const { mode, workspaceStrategy, projectName } = resolvedResult.data;
    const projectBaseBranch = resolvePrimaryBranch(resolvedResult.data);

    const executionWorkspacePath = getExecutionWorkspacePath({
        mode,
        sourceProjectRoot,
        globalConfigFolderPath,
        projectName,
    });

    return success({
        executionWorkspacePath,
        projectBaseBranch,
        mode,
        workspaceStrategy,
    });
}
