import path from 'node:path';

import { lumpPathAndName } from './lumpPathAndName';

export type BacklogPaths = {
    lumpPath: string;
    lumpName: string;
    backlogFilePath: string;
    doneFilePath: string;
};

function assertProjectRelativePath(filePath: string, label: string): void {
    if (path.isAbsolute(filePath)) {
        throw new Error(`${label} must be project-root-relative, not absolute: ${filePath}`);
    }
}

export function resolveBacklogPaths(
    configUrl: string | URL,
    overrides?: {
        backlogFilePath?: string;
        doneFilePath?: string;
    },
): BacklogPaths {
    const [lumpPath, lumpName] = lumpPathAndName(configUrl);
    const backlogFilePath = overrides?.backlogFilePath ?? path.join(lumpPath, 'BACKLOG.yml');
    const doneFilePath = overrides?.doneFilePath ?? path.join(lumpPath, 'DONE.yml');

    assertProjectRelativePath(backlogFilePath, 'backlogFilePath');
    assertProjectRelativePath(doneFilePath, 'doneFilePath');

    return {
        lumpPath,
        lumpName,
        backlogFilePath,
        doneFilePath,
    };
}
