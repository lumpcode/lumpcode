import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { getCommandPath } from './main';

describe('getCommandPath', () => {
    const bundlePresetsDir = path.resolve(__dirname, '../../presets/commands');

    async function withTempDirs(
        fn: (dirs: {
            localConfigFolderPath: string;
            globalConfigFolderPath: string;
        }) => Promise<void>,
    ) {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lumpcode-getCommandPath-'));
        try {
            const localConfigFolderPath = path.join(root, 'local', '.lumpcode');
            const globalConfigFolderPath = path.join(root, 'global');
            await fs.mkdir(path.join(localConfigFolderPath, 'commands'), { recursive: true });
            await fs.mkdir(path.join(globalConfigFolderPath, 'commands', 'presets'), { recursive: true });
            await fn({ localConfigFolderPath, globalConfigFolderPath });
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    }

    it('prefers project-local over global override and preset', async () => {
        await withTempDirs(async ({ localConfigFolderPath, globalConfigFolderPath }) => {
            await fs.writeFile(
                path.join(localConfigFolderPath, 'commands', 'cursor.js'),
                'export const command = () => ({ executable: "local" });',
            );
            await fs.writeFile(
                path.join(globalConfigFolderPath, 'commands', 'cursor.js'),
                'export const command = () => ({ executable: "global" });',
            );
            await fs.copyFile(
                path.join(bundlePresetsDir, 'cursor.js'),
                path.join(globalConfigFolderPath, 'commands', 'presets', 'cursor.js'),
            );

            const resolved = await getCommandPath('cursor', { localConfigFolderPath, globalConfigFolderPath });
            expect(resolved).toBe(path.join(localConfigFolderPath, 'commands', 'cursor.js'));
        });
    });

    it('prefers global override over preset when project-local is missing', async () => {
        await withTempDirs(async ({ localConfigFolderPath, globalConfigFolderPath }) => {
            await fs.writeFile(
                path.join(globalConfigFolderPath, 'commands', 'cursor.js'),
                'export const command = () => ({ executable: "global" });',
            );
            await fs.copyFile(
                path.join(bundlePresetsDir, 'cursor.js'),
                path.join(globalConfigFolderPath, 'commands', 'presets', 'cursor.js'),
            );

            const resolved = await getCommandPath('cursor', { localConfigFolderPath, globalConfigFolderPath });
            expect(resolved).toBe(path.join(globalConfigFolderPath, 'commands', 'cursor.js'));
        });
    });

    it('falls back to preset when project-local and global override are missing', async () => {
        await withTempDirs(async ({ localConfigFolderPath, globalConfigFolderPath }) => {
            const presetPath = path.join(globalConfigFolderPath, 'commands', 'presets', 'cursor.js');
            await fs.copyFile(path.join(bundlePresetsDir, 'cursor.js'), presetPath);

            const resolved = await getCommandPath('cursor', { localConfigFolderPath, globalConfigFolderPath });
            expect(resolved).toBe(presetPath);
        });
    });

    it('returns the preset candidate path when no tier exists (load fails later)', async () => {
        await withTempDirs(async ({ localConfigFolderPath, globalConfigFolderPath }) => {
            const resolved = await getCommandPath('unknown-agent', { localConfigFolderPath, globalConfigFolderPath });
            expect(resolved).toBe(
                path.join(globalConfigFolderPath, 'commands', 'presets', 'unknown-agent.js'),
            );
        });
    });

    it('C1 prefers local .ts over local .js', async () => {
        await withTempDirs(async ({ localConfigFolderPath, globalConfigFolderPath }) => {
            await fs.writeFile(
                path.join(localConfigFolderPath, 'commands', 'cursor.js'),
                'export const command = () => ({ executable: "local-js" });',
            );
            await fs.writeFile(
                path.join(localConfigFolderPath, 'commands', 'cursor.ts'),
                'export const command = () => ({ executable: "local-ts" });',
            );

            const resolved = await getCommandPath('cursor', { localConfigFolderPath, globalConfigFolderPath });
            expect(resolved).toBe(path.join(localConfigFolderPath, 'commands', 'cursor.ts'));
        });
    });

    it('C2 prefers local .js when no local .ts exists', async () => {
        await withTempDirs(async ({ localConfigFolderPath, globalConfigFolderPath }) => {
            await fs.writeFile(
                path.join(localConfigFolderPath, 'commands', 'cursor.js'),
                'export const command = () => ({ executable: "local-js" });',
            );

            const resolved = await getCommandPath('cursor', { localConfigFolderPath, globalConfigFolderPath });
            expect(resolved).toBe(path.join(localConfigFolderPath, 'commands', 'cursor.js'));
        });
    });

    it('C3 prefers global .ts over global .js when local is missing', async () => {
        await withTempDirs(async ({ localConfigFolderPath, globalConfigFolderPath }) => {
            await fs.writeFile(
                path.join(globalConfigFolderPath, 'commands', 'cursor.js'),
                'export const command = () => ({ executable: "global-js" });',
            );
            await fs.writeFile(
                path.join(globalConfigFolderPath, 'commands', 'cursor.ts'),
                'export const command = () => ({ executable: "global-ts" });',
            );

            const resolved = await getCommandPath('cursor', { localConfigFolderPath, globalConfigFolderPath });
            expect(resolved).toBe(path.join(globalConfigFolderPath, 'commands', 'cursor.ts'));
        });
    });

    it('C5 prefers local .js over global .ts', async () => {
        await withTempDirs(async ({ localConfigFolderPath, globalConfigFolderPath }) => {
            await fs.writeFile(
                path.join(localConfigFolderPath, 'commands', 'cursor.js'),
                'export const command = () => ({ executable: "local-js" });',
            );
            await fs.writeFile(
                path.join(globalConfigFolderPath, 'commands', 'cursor.ts'),
                'export const command = () => ({ executable: "global-ts" });',
            );

            const resolved = await getCommandPath('cursor', { localConfigFolderPath, globalConfigFolderPath });
            expect(resolved).toBe(path.join(localConfigFolderPath, 'commands', 'cursor.js'));
        });
    });
});
