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
            JSON.stringify({ mode: 'shared', projectBaseBranch: 'main' }),
            'utf-8',
        );
        const result = await readLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toEqual({
            mode: 'shared',
            projectBaseBranch: 'main',
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
            JSON.stringify({ mode: 'in-place', projectBaseBranch: 'main' }),
            'utf-8',
        );
        const result = await readLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toContain('mode');
    });

    it('fails when projectBaseBranch is missing and projectBaseBranches is absent', async () => {
        await fs.writeFile(
            path.join(dir, LOCAL_CONFIG_FILE_NAME),
            JSON.stringify({ mode: 'shared' }),
            'utf-8',
        );
        const result = await readLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/projectBaseBranch|projectBaseBranches/i);
    });

    it('accepts valid projectBaseBranches', async () => {
        await fs.writeFile(
            path.join(dir, LOCAL_CONFIG_FILE_NAME),
            JSON.stringify({
                mode: 'dedicated',
                projectBaseBranch: 'main',
                projectBaseBranches: ['main', 'ver/0.0.9'],
            }),
            'utf-8',
        );
        const result = await readLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.projectBaseBranches).toEqual(['main', 'ver/0.0.9']);
    });

    it('accepts array-only config (LC-MULTI-ARRAY-ONLY)', async () => {
        await fs.writeFile(
            path.join(dir, LOCAL_CONFIG_FILE_NAME),
            JSON.stringify({
                mode: 'dedicated',
                projectBaseBranches: ['main', 'ver/0.0.9'],
            }),
            'utf-8',
        );
        const result = await readLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.projectBaseBranches).toEqual(['main', 'ver/0.0.9']);
        expect(result.data.projectBaseBranch).toBeUndefined();
    });

    it('rejects empty projectBaseBranches array (LC-EMPTY-ARRAY)', async () => {
        await fs.writeFile(
            path.join(dir, LOCAL_CONFIG_FILE_NAME),
            JSON.stringify({
                mode: 'dedicated',
                projectBaseBranch: 'main',
                projectBaseBranches: [],
            }),
            'utf-8',
        );
        const result = await readLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/empty|projectBaseBranches/i);
    });

    it('rejects duplicate branch names in projectBaseBranches (LC-DUPES)', async () => {
        await fs.writeFile(
            path.join(dir, LOCAL_CONFIG_FILE_NAME),
            JSON.stringify({
                mode: 'dedicated',
                projectBaseBranch: 'main',
                projectBaseBranches: ['main', 'main'],
            }),
            'utf-8',
        );
        const result = await readLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/duplicate/i);
    });

    it('rejects non-string array elements in projectBaseBranches', async () => {
        await fs.writeFile(
            path.join(dir, LOCAL_CONFIG_FILE_NAME),
            JSON.stringify({
                mode: 'dedicated',
                projectBaseBranches: ['main', 42],
            }),
            'utf-8',
        );
        const result = await readLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/projectBaseBranches/i);
    });

    it('defaults workspaceStrategy to checkout when omitted', async () => {
        await fs.writeFile(
            path.join(dir, LOCAL_CONFIG_FILE_NAME),
            JSON.stringify({ mode: 'dedicated', projectBaseBranch: 'main' }),
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
                projectBaseBranch: 'main',
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
                projectBaseBranch: 'main',
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
            JSON.stringify({ mode: 'shared', projectBaseBranch: 'main', disabled: 'yes' }),
            'utf-8',
        );
        const result = await readLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toContain('disabled');
    });

    it('fails when projectBaseBranch is an empty string', async () => {
        await fs.writeFile(
            path.join(dir, LOCAL_CONFIG_FILE_NAME),
            JSON.stringify({ mode: 'dedicated', projectBaseBranch: '' }),
            'utf-8',
        );
        const result = await readLocalConfig({ localConfigFolderPath: dir });
        expect(result.success).toBe(false);
    });
});
