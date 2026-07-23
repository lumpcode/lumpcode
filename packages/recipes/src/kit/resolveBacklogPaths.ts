import path from 'node:path';

import { lumpPathAndName } from './lumpPathAndName';

export type BacklogPaths = {
    lumpPath: string;
    lumpName: string;
    backlogItemsDir: string;
};

function assertProjectRelativePath(filePath: string, label: string): void {
    if (path.isAbsolute(filePath)) {
        throw new Error(`${label} must be project-root-relative, not absolute: ${filePath}`);
    }
}

export function resolveBacklogPaths(
    configUrl: string | URL,
    overrides?: {
        backlogItemsDir?: string;
    },
): BacklogPaths {
    const [lumpPath, lumpName] = lumpPathAndName(configUrl);
    const backlogItemsDir = overrides?.backlogItemsDir ?? path.join(lumpPath, 'backlogItems');

    assertProjectRelativePath(backlogItemsDir, 'backlogItemsDir');

    return {
        lumpPath,
        lumpName,
        backlogItemsDir,
    };
}
