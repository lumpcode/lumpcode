import * as path from 'node:path';

export function localConfigFolderPath(input: { projectRoot: string }): string {
    return path.join(input.projectRoot, '.lumpcode');
}
