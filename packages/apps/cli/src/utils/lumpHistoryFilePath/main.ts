import { join } from 'node:path';

export function lumpHistoryFilePath({
    projectRoot,
    lumpName,
    contextName,
}: {
    projectRoot: string;
    lumpName: string;
    contextName: string;
}): string {
    return join(
        projectRoot,
        '.lumpcode',
        'lumps',
        lumpName,
        'history',
        `${contextName}.yaml`,
    );
}
