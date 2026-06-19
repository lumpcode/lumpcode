import * as path from 'node:path';

import type { WorkspaceStrategy } from '../../types/WorkspaceStrategy';
import { lumpWorktreePath } from '../getLumpWorktreePath';

export function branchWorkspacePath({
    executionWorkspacePath,
    workspaceStrategy,
    branchName,
}: {
    executionWorkspacePath: string;
    workspaceStrategy: WorkspaceStrategy;
    branchName: string;
}): string {
    const resolvedExecution = path.resolve(executionWorkspacePath);
    if (workspaceStrategy === 'checkout') {
        return resolvedExecution;
    }
    return lumpWorktreePath({ executionWorkspacePath: resolvedExecution, branchName });
}
