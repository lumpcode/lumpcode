import * as path from 'node:path';

export function projectJsonPath(input: { localConfigFolderPath: string }): string {
    return path.join(input.localConfigFolderPath, 'project.json');
}
