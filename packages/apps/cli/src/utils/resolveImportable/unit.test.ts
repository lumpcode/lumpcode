import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { readCacheMeta, withTsLumpProject, writeCommandModuleTs } from '../../testing/tsLumpFixtures';
import { resolveImportable } from './main';

describe('resolveImportable', () => {
    it('R1 loads an existing .js path', async () => {
        await withTsLumpProject(async ({ lumpDir }) => {
            const jsPath = path.join(lumpDir, 'legacy.js');
            await fs.writeFile(jsPath, 'export default { fromJs: true };', 'utf-8');

            const result = await resolveImportable<{ fromJs: boolean }>(jsPath, 'default');
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(result.data).toEqual({ fromJs: true });
        });
    });

    it('R2 loads a .ts default export via transpile cache', async () => {
        await withTsLumpProject(async ({ lumpDir, projectRoot }) => {
            const tsPath = path.join(lumpDir, 'hook.ts');
            await fs.writeFile(tsPath, 'export default { fromTs: true };', 'utf-8');

            const result = await resolveImportable<{ fromTs: boolean }>(tsPath, 'default');
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(result.data).toEqual({ fromTs: true });
            expect((await readCacheMeta(projectRoot)).length).toBeGreaterThan(0);
        });
    });

    it('R3 loads a full .ts command module shape via transpile cache', async () => {
        await withTsLumpProject(async ({ localConfigFolderPath, projectRoot }) => {
            const commandsDir = path.join(localConfigFolderPath, 'commands');
            const tsPath = await writeCommandModuleTs(
                commandsDir,
                'agent',
                `export const command = () => ({ executable: 'ts-agent', args: [] });
export const setup = () => ({ contextRunState: { ts: true } });
export const teardown = () => {};`,
            );

            const result = await resolveImportable<Record<string, unknown>>(tsPath, null);
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(typeof result.data.command).toBe('function');
            expect(typeof result.data.setup).toBe('function');
            expect(typeof result.data.teardown).toBe('function');
            expect((await readCacheMeta(projectRoot)).length).toBeGreaterThan(0);
        });
    });

    it('R4 resolves relative .ts paths from importBasePath via transpile cache', async () => {
        await withTsLumpProject(async ({ lumpDir, projectRoot }) => {
            await fs.writeFile(path.join(lumpDir, 'setup.ts'), 'export default () => ({ ok: true });', 'utf-8');

            const result = await resolveImportable<() => { ok: boolean }>('./setup.ts', 'default', {
                importBasePath: lumpDir,
            });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(result.data()).toEqual({ ok: true });
            expect((await readCacheMeta(projectRoot)).length).toBeGreaterThan(0);
        });
    });

    it('R5 returns Failure instead of throwing when .ts transpile fails', async () => {
        await withTsLumpProject(async ({ lumpDir, projectRoot }) => {
            const tsPath = path.join(lumpDir, 'invalid.ts');
            await fs.writeFile(tsPath, 'export default function(', 'utf-8');

            const result = await resolveImportable(tsPath, 'default');
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data).toContain(path.basename(tsPath));
            expect((await readCacheMeta(projectRoot)).length).toBe(0);
        });
    });
});
