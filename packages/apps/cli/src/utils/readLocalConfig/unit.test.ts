import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LOCAL_CONFIG_FILE_NAME, readLocalConfig } from './main';

describe('readLocalConfig', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-local-config-'));
    });

    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    it('returns the parsed config when local.json is valid', async () => {
        await fs.writeFile(
            path.join(dir, LOCAL_CONFIG_FILE_NAME),
            JSON.stringify({ mode: 'shared', primaryBranch: 'main' }),
            'utf-8',
        );
        const result = await readLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toEqual({
            mode: 'shared',
            primaryBranch: 'main',
            workspaceStrategy: 'checkout',
        });
    });

    it('hard-fails when local.json is missing', async () => {
        const result = await readLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toContain('Missing .lumpcode/local.json');
    });

    it('fails on invalid JSON', async () => {
        await fs.writeFile(path.join(dir, LOCAL_CONFIG_FILE_NAME), 'not json', 'utf-8');
        const result = await readLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toContain('Invalid JSON');
    });

    it('fails when mode is not in the enum', async () => {
        await fs.writeFile(
            path.join(dir, LOCAL_CONFIG_FILE_NAME),
            JSON.stringify({ mode: 'in-place', primaryBranch: 'main' }),
            'utf-8',
        );
        const result = await readLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toContain('mode');
    });

    /**
     * clean-local-project-json-config L*.
     * L1/L8: mode-only succeeds (primary validated on merge, not per-file).
     * workspaceStrategy default is asserted on merge (M5); here we only require mode-only success.
     */
    describe('readLocalConfig (clean-local-project-json-config L*)', () => {
        it('L1/L8: mode-only succeeds without primary', async () => {
            await fs.writeFile(
                path.join(dir, LOCAL_CONFIG_FILE_NAME),
                JSON.stringify({ mode: 'shared' }),
                'utf-8',
            );
            const result = await readLocalConfig({ localConfigFolderPath: dir });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(result.data.mode).toBe('shared');
        });

        it('L2: accepts lump-default fields', async () => {
            await fs.writeFile(
                path.join(dir, LOCAL_CONFIG_FILE_NAME),
                JSON.stringify({
                    mode: 'dedicated',
                    primaryBranch: 'main',
                    command: 'cursor',
                    maximumNumberOfConcurrentBranches: 2,
                    keepHistory: true,
                    verbose: true,
                }),
                'utf-8',
            );
            const result = await readLocalConfig({ localConfigFolderPath: dir });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(result.data.command).toBe('cursor');
            expect(result.data.maximumNumberOfConcurrentBranches).toBe(2);
            expect(result.data.keepHistory).toBe(true);
            expect(result.data.verbose).toBe(true);
        });

        it('L3: rejects projectName', async () => {
            await fs.writeFile(
                path.join(dir, LOCAL_CONFIG_FILE_NAME),
                JSON.stringify({ mode: 'shared', projectName: 'x', primaryBranch: 'main' }),
                'utf-8',
            );
            const result = await readLocalConfig({ localConfigFolderPath: dir });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data).toContain('projectName');
        });

        it('L4: rejects unknown key', async () => {
            await fs.writeFile(
                path.join(dir, LOCAL_CONFIG_FILE_NAME),
                JSON.stringify({ mode: 'shared', primaryBranch: 'main', extra: true }),
                'utf-8',
            );
            const result = await readLocalConfig({ localConfigFolderPath: dir });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data).toMatch(/extra|unrecognized|unknown|strict/i);
        });

        it('L5: path-shaped command fails', async () => {
            await fs.writeFile(
                path.join(dir, LOCAL_CONFIG_FILE_NAME),
                JSON.stringify({ mode: 'shared', primaryBranch: 'main', command: 'foo.js' }),
                'utf-8',
            );
            const result = await readLocalConfig({ localConfigFolderPath: dir });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data).toMatch(/command|\.js|path/i);
        });

        it('L6: tag command succeeds', async () => {
            await fs.writeFile(
                path.join(dir, LOCAL_CONFIG_FILE_NAME),
                JSON.stringify({ mode: 'shared', primaryBranch: 'main', command: 'copilot' }),
                'utf-8',
            );
            const result = await readLocalConfig({ localConfigFolderPath: dir });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(result.data.command).toBe('copilot');
        });

        it('L9: invalid verbose type', async () => {
            await fs.writeFile(
                path.join(dir, LOCAL_CONFIG_FILE_NAME),
                JSON.stringify({ mode: 'shared', primaryBranch: 'main', verbose: 'yes' }),
                'utf-8',
            );
            const result = await readLocalConfig({ localConfigFolderPath: dir });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data).toContain('verbose');
        });

        it('accepts whitespace command string that is not path-shaped', async () => {
            await fs.writeFile(
                path.join(dir, LOCAL_CONFIG_FILE_NAME),
                JSON.stringify({
                    mode: 'shared',
                    primaryBranch: 'main',
                    command: 'use cursor.js carefully',
                }),
                'utf-8',
            );
            const result = await readLocalConfig({ localConfigFolderPath: dir });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(result.data.command).toBe('use cursor.js carefully');
        });
    });

    it('accepts valid primaryBranches', async () => {
        await fs.writeFile(
            path.join(dir, LOCAL_CONFIG_FILE_NAME),
            JSON.stringify({
                mode: 'dedicated',
                primaryBranch: 'main',
                primaryBranches: ['main', 'ver/0.0.9'],
            }),
            'utf-8',
        );
        const result = await readLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.primaryBranches).toEqual(['main', 'ver/0.0.9']);
    });

    it('accepts array-only config (LC-MULTI-ARRAY-ONLY)', async () => {
        await fs.writeFile(
            path.join(dir, LOCAL_CONFIG_FILE_NAME),
            JSON.stringify({
                mode: 'dedicated',
                primaryBranches: ['main', 'ver/0.0.9'],
            }),
            'utf-8',
        );
        const result = await readLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.primaryBranches).toEqual(['main', 'ver/0.0.9']);
        expect(result.data.primaryBranch).toBeUndefined();
    });

    it('rejects empty primaryBranches array (LC-EMPTY-ARRAY)', async () => {
        await fs.writeFile(
            path.join(dir, LOCAL_CONFIG_FILE_NAME),
            JSON.stringify({
                mode: 'dedicated',
                primaryBranch: 'main',
                primaryBranches: [],
            }),
            'utf-8',
        );
        const result = await readLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/empty|primaryBranches/i);
    });

    it('rejects duplicate branch names in primaryBranches (LC-DUPES)', async () => {
        await fs.writeFile(
            path.join(dir, LOCAL_CONFIG_FILE_NAME),
            JSON.stringify({
                mode: 'dedicated',
                primaryBranch: 'main',
                primaryBranches: ['main', 'main'],
            }),
            'utf-8',
        );
        const result = await readLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/duplicate/i);
    });

    it('rejects non-string array elements in primaryBranches', async () => {
        await fs.writeFile(
            path.join(dir, LOCAL_CONFIG_FILE_NAME),
            JSON.stringify({
                mode: 'dedicated',
                primaryBranches: ['main', 42],
            }),
            'utf-8',
        );
        const result = await readLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/primaryBranches/i);
    });

    it('defaults workspaceStrategy to checkout when omitted', async () => {
        await fs.writeFile(
            path.join(dir, LOCAL_CONFIG_FILE_NAME),
            JSON.stringify({ mode: 'dedicated', primaryBranch: 'main' }),
            'utf-8',
        );
        const result = await readLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.workspaceStrategy).toBe('checkout');
    });

    it('accepts workspaceStrategy worktree', async () => {
        await fs.writeFile(
            path.join(dir, LOCAL_CONFIG_FILE_NAME),
            JSON.stringify({
                mode: 'shared',
                primaryBranch: 'main',
                workspaceStrategy: 'worktree',
            }),
            'utf-8',
        );
        const result = await readLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.workspaceStrategy).toBe('worktree');
    });

    it('accepts disabled when true', async () => {
        await fs.writeFile(
            path.join(dir, LOCAL_CONFIG_FILE_NAME),
            JSON.stringify({
                mode: 'shared',
                primaryBranch: 'main',
                disabled: true,
            }),
            'utf-8',
        );
        const result = await readLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.disabled).toBe(true);
    });

    it('fails when disabled is not a boolean', async () => {
        await fs.writeFile(
            path.join(dir, LOCAL_CONFIG_FILE_NAME),
            JSON.stringify({ mode: 'shared', primaryBranch: 'main', disabled: 'yes' }),
            'utf-8',
        );
        const result = await readLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toContain('disabled');
    });

    it('fails when primaryBranch is an empty string', async () => {
        await fs.writeFile(
            path.join(dir, LOCAL_CONFIG_FILE_NAME),
            JSON.stringify({ mode: 'dedicated', primaryBranch: '' }),
            'utf-8',
        );
        const result = await readLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(false);
    });

    describe('maxParallelRun (parallel-global-daemon-worktree L*)', () => {
        it('L1: omits maxParallelRun when field is absent', async () => {
            await fs.writeFile(
                path.join(dir, LOCAL_CONFIG_FILE_NAME),
                JSON.stringify({
                    mode: 'dedicated',
                    primaryBranch: 'main',
                    workspaceStrategy: 'worktree',
                }),
                'utf-8',
            );
            const result = await readLocalConfig({ localConfigFolderPath: dir });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(result.data.maxParallelRun).toBeUndefined();
        });

        it('L2: accepts positive integer maxParallelRun', async () => {
            await fs.writeFile(
                path.join(dir, LOCAL_CONFIG_FILE_NAME),
                JSON.stringify({
                    mode: 'dedicated',
                    primaryBranch: 'main',
                    workspaceStrategy: 'worktree',
                    maxParallelRun: 3,
                }),
                'utf-8',
            );
            const result = await readLocalConfig({ localConfigFolderPath: dir });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(result.data.maxParallelRun).toBe(3);
        });

        it('L3: rejects maxParallelRun: 0', async () => {
            await fs.writeFile(
                path.join(dir, LOCAL_CONFIG_FILE_NAME),
                JSON.stringify({
                    mode: 'dedicated',
                    primaryBranch: 'main',
                    maxParallelRun: 0,
                }),
                'utf-8',
            );
            const result = await readLocalConfig({ localConfigFolderPath: dir });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data).toMatch(/maxParallelRun|positive/i);
        });

        it('L4: rejects negative maxParallelRun', async () => {
            await fs.writeFile(
                path.join(dir, LOCAL_CONFIG_FILE_NAME),
                JSON.stringify({
                    mode: 'dedicated',
                    primaryBranch: 'main',
                    maxParallelRun: -2,
                }),
                'utf-8',
            );
            const result = await readLocalConfig({ localConfigFolderPath: dir });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data).toMatch(/maxParallelRun|positive/i);
        });

        it.each([
            { label: 'float', value: 1.5 },
            { label: 'string', value: '2' },
            { label: 'boolean', value: true },
            { label: 'null', value: null },
            { label: 'object', value: {} },
        ])('L5: rejects non-integer maxParallelRun ($label)', async ({ value }) => {
            await fs.writeFile(
                path.join(dir, LOCAL_CONFIG_FILE_NAME),
                JSON.stringify({
                    mode: 'dedicated',
                    primaryBranch: 'main',
                    maxParallelRun: value,
                }),
                'utf-8',
            );
            const result = await readLocalConfig({ localConfigFolderPath: dir });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data).toMatch(/maxParallelRun/i);
        });

        it('L6: accepts maxParallelRun: 1 explicitly', async () => {
            await fs.writeFile(
                path.join(dir, LOCAL_CONFIG_FILE_NAME),
                JSON.stringify({
                    mode: 'dedicated',
                    primaryBranch: 'main',
                    maxParallelRun: 1,
                }),
                'utf-8',
            );
            const result = await readLocalConfig({ localConfigFolderPath: dir });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(result.data.maxParallelRun).toBe(1);
        });
    });
});
