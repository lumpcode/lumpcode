import * as path from 'node:path';

import type { Mode } from '../../types/Mode';

export function getExecutionWorkspacePath(input: {
    mode: Mode;
    sourceProjectRoot: string;
    globalConfigFolderPath: string;
    projectName: string;
}): string {
    return path.resolve(input.sourceProjectRoot);
}
