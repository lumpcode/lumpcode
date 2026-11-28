import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { planLumpFromJsConfig } from '../../utils/planLumpFromJsConfig';

const WORKFLOW_LUMPS = [
    'backlog',
    'qol',
    'bugfixes',
    'docs',
    'abstractionFinder',
    'abstractionImplementer',
] as const;

// Skipped until the impl stage moves these lumps onto the workflow recipes. Unskip; do not rewrite.
describe.skip('lump-plan workflow recipes', () => {
    it('plans the six lumps as workflow runs', async () => {
        const repoRoot = findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));
        const localConfigFolderPath = path.join(repoRoot, '.lumpcode');
        const localJsonPath = path.join(localConfigFolderPath, 'local.json');
        const wroteLocalJson = !existsSync(localJsonPath);
        if (wroteLocalJson) {
            await writeFile(localJsonPath, `${JSON.stringify({ mode: 'shared', primaryBranch: 'dev' })}\n`);
        }
        const globalConfigFolderPath = await mkdtemp(path.join(tmpdir(), 'lump-plan-recipes-'));

        try {
            for (const lumpName of WORKFLOW_LUMPS) {
                const result = await planLumpFromJsConfig({
                    lumpName,
                    localConfigFolderPath,
                    globalConfigFolderPath,
                    projectRoot: repoRoot,
                    depth: 'contexts',
                });
                expect(result.success, result.success ? lumpName : `${lumpName}: ${result.data}`).toBe(true);
                if (!result.success) continue;
                expect(result.data.run).toBe('workflow');
                expect(Array.isArray(result.data.contexts)).toBe(true);
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
        if (parent === dir) break;
        dir = parent;
    }
    throw new Error(`repo root not found from ${start}`);
}
