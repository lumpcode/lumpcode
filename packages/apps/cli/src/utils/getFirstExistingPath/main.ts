import { pathExists } from '@lumpcode/core';

export async function getFirstExistingPath(
    paths: string[],
    defaultPath?: string,
) {
    for (const candidate of paths) {
        if (await pathExists(candidate)) {
            return candidate;
        }
    }
    return defaultPath || paths[paths.length - 1];
}
