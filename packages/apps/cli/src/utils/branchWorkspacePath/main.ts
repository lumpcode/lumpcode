import * as path from 'node:path';

import type { Mode } from '../../types/Mode';
import type { WorkspaceStrategy } from '../../types/WorkspaceStrategy';
import { lumpWorktreePath } from '../getLumpWorktreePath';

/**
 * Absolute path of the branch workspace for a lump run.
 * Shared stays on the execution checkout (ignores `workspaceStrategy`).
 * Dedicated `worktree` is under `.lumpcode/worktrees/<lump/…>`.
 */
export function branchWorkspacePath({
    executionWorkspacePath,
    workspaceStrategy,
    branchName,
    mode,
}: {
    executionWorkspacePath: string;
    workspaceStrategy: WorkspaceStrategy;
    branchName: string;
    mode?: Mode;
}): string {
    const resolvedExecution = path.resolve(executionWorkspacePath);
    if (mode === 'shared' || workspaceStrategy === 'checkout') {
        return resolvedExecution;
    }
    return lumpWorktreePath({ executionWorkspacePath: resolvedExecution, branchName });
}
