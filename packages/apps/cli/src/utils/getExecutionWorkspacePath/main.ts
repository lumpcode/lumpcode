import * as path from 'node:path';

import type { Mode } from '../../types/Mode';

export function getExecutionWorkspacePath(input: {
    mode: Mode;
    sourceProjectRoot: string;
    globalConfigFolderPath: string;
    projectName: string;
}): string {
    const { mode, sourceProjectRoot, globalConfigFolderPath, projectName } = input;
    if (mode === 'shared') {
        return path.resolve(globalConfigFolderPath, 'project-copies', projectName);
    }
    return path.resolve(sourceProjectRoot);
}
