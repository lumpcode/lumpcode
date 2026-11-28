import { existsSync } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const LOCK_DIR_NAME = '.lump-plan-repo-test.lock';

/**
 * The repo lump-plan tests share `.lumpcode/local.json`. Hold this lock for the
 * whole plan so one test cannot delete the file while the other is still reading it.
 */
export async function withRepoLocalJson<T>(
    repoRoot: string,
    body: (localConfigFolderPath: string) => Promise<T>,
): Promise<T> {
    const localConfigFolderPath = path.join(repoRoot, '.lumpcode');
    const lockDir = path.join(localConfigFolderPath, LOCK_DIR_NAME);
    await acquireLock(lockDir);
    const localJsonPath = path.join(localConfigFolderPath, 'local.json');
    const existed = existsSync(localJsonPath);
    if (!existed) {
        await writeFile(
            localJsonPath,
            `${JSON.stringify({ mode: 'shared', primaryBranch: 'dev' })}\n`,
        );
    }
    try {
        return await body(localConfigFolderPath);
    } finally {
        if (!existed) {
            await rm(localJsonPath, { force: true });
        }
        await rm(lockDir, { recursive: true, force: true });
    }
}

async function acquireLock(lockDir: string): Promise<void> {
    const started = Date.now();
    for (;;) {
        try {
            await mkdir(lockDir);
            return;
        } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err.code !== 'EEXIST') {
                throw error;
            }
            try {
                const info = await stat(lockDir);
                if (Date.now() - info.mtimeMs > 60_000) {
                    await rm(lockDir, { recursive: true, force: true });
                    continue;
                }
            } catch {
                continue;
            }
            if (Date.now() - started > 120_000) {
                throw new Error('timed out waiting for the repo local.json test lock');
            }
            await new Promise((resolve) => setTimeout(resolve, 25));
        }
    }
}
