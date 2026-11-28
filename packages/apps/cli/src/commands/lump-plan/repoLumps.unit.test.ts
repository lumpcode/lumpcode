import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { planLumpFromJsConfig } from '../../utils/planLumpFromJsConfig';

// Skipped until the impl stage. Unskip; do not rewrite.
describe.skip('lump-plan for every repo lump', () => {
    it('validates each lump under .lumpcode/lumps', async () => {
        const repoRoot = findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));
        const localConfigFolderPath = path.join(repoRoot, '.lumpcode');
        const localJsonPath = path.join(localConfigFolderPath, 'local.json');
        const wroteLocalJson = !existsSync(localJsonPath);
        if (wroteLocalJson) {
            await writeFile(localJsonPath, `${JSON.stringify({ mode: 'shared', primaryBranch: 'dev' })}\n`);
        }
        const globalConfigFolderPath = await mkdtemp(path.join(tmpdir(), 'lump-plan-repo-'));

        try {
            const entries = await readdir(path.join(localConfigFolderPath, 'lumps'), { withFileTypes: true });
            const lumpNames = entries
                .filter((entry) => entry.isDirectory())
                .map((entry) => entry.name)
                .filter((name) => existsSync(path.join(localConfigFolderPath, 'lumps', name, 'config.ts')))
                .sort();

            expect(lumpNames.length).toBeGreaterThan(0);

            for (const lumpName of lumpNames) {
                const result = await planLumpFromJsConfig({
                    lumpName,
                    localConfigFolderPath,
                    globalConfigFolderPath,
                    projectRoot: repoRoot,
                    depth: 'validate',
                });
                expect(result.success, result.success ? lumpName : `${lumpName}: ${result.data}`).toBe(true);
            }
        } finally {
            if (wroteLocalJson) {
                await rm(localJsonPath, { force: true });
            }
            await rm(globalConfigFolderPath, { recursive: true, force: true });
        }
    });
});

function findRepoRoot(start: string): string {
    let dir = start;
    for (let i = 0; i < 8; i += 1) {
        if (existsSync(path.join(dir, '.lumpcode', 'lumps', 'backlog', 'config.ts'))) {
            return dir;
        }
        const parent = path.dirname(dir);
        if (parent === dir) {
            break;
        }
        dir = parent;
    }
    throw new Error(`repo root not found from ${start}`);
}
