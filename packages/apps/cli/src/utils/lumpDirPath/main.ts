import * as path from 'node:path';

export function lumpsDirPath(input: { localConfigFolderPath: string }): string {
    return path.join(input.localConfigFolderPath, 'lumps');
}

export function lumpDirPath(input: { localConfigFolderPath: string; lumpName: string }): string {
    return path.join(lumpsDirPath({ localConfigFolderPath: input.localConfigFolderPath }), input.lumpName);
}

/** Alias for `lumpDirPath` — import base for lump-config `*Fn` module resolution. */
export const lumpImportBasePath = lumpDirPath;
