import * as path from 'node:path';

export function projectCopiesRootPath(input: { globalConfigFolderPath: string }): string {
    return path.join(input.globalConfigFolderPath, 'project-copies');
}
