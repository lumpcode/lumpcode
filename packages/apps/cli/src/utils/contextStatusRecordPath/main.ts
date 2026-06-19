import * as path from 'node:path';

import { localConfigFolderPath } from '../localConfigFolderPath';
import { lumpDirPath } from '../lumpDirPath';

export function contextStatusRecordPath(input: {
    projectRoot: string;
    lumpName: string;
}): string {
    const { projectRoot, lumpName } = input;
    return path.join(
        lumpDirPath({ localConfigFolderPath: localConfigFolderPath({ projectRoot }), lumpName }),
        'contextStatusRecord.json',
    );
}