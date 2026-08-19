import * as fs from 'node:fs/promises';

/** Best-effort unlink of present paths. Missing files and omitted entries are ignored. */
export async function unlinkBestEffort(paths: Array<string | undefined>): Promise<void> {
    await Promise.all(
        paths.map((filePath) => (filePath === undefined ? undefined : fs.unlink(filePath).catch(() => {}))),
    );
}
