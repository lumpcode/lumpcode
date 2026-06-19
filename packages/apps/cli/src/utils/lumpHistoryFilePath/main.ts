import * as path from 'node:path';

import { localConfigFolderPath } from '../localConfigFolderPath';
import { lumpDirPath } from '../lumpDirPath';

export function lumpHistoryFilePath(input: {
    projectRoot: string;
    lumpName: string;
    contextName: string;
}): string {
    const { projectRoot, lumpName, contextName } = input;
    return path.join(
        lumpDirPath({ localConfigFolderPath: localConfigFolderPath({ projectRoot }), lumpName }),
        'history',
        `${contextName}.json`,
    );
}
