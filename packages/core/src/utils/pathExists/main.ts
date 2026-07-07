import * as fs from 'node:fs/promises';

/** Returns whether `filePath` is accessible to this process (typically exists). */
export async function pathExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}
