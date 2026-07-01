import * as path from 'node:path';

const sharedExecutionWorkspaces = new Map<string, string>();

export function rememberSharedExecutionWorkspace(
    sourceProjectRoot: string,
    executionWorkspacePath: string,
): void {
    sharedExecutionWorkspaces.set(
        path.resolve(sourceProjectRoot),
        path.resolve(executionWorkspacePath),
    );
}

export function recallSharedExecutionWorkspace(sourceProjectRoot: string): string | undefined {
    return sharedExecutionWorkspaces.get(path.resolve(sourceProjectRoot));
}
