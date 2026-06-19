import * as fs from 'node:fs/promises';

export async function getFirstExistingPath(
    paths: string[],
    defaultPath?: string,
) {
    for (const path of paths) {
        try {
            await fs.access(path);
            return path;
        } catch {
            continue;
        }
    }
    return defaultPath || paths[paths.length - 1];
}