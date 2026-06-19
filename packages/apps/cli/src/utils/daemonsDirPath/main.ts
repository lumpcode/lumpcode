import * as path from 'node:path';

export function daemonsDirPath(input: { globalConfigFolderPath: string }): string {
    return path.join(input.globalConfigFolderPath, 'daemons');
}
