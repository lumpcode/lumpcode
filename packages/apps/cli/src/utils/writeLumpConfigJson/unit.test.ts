import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { MINIMAL_RUNNABLE_LUMP_CONFIG, writeLumpConfigJson } from './main';

describe('writeLumpConfigJson', () => {
    let tmpRoot: string;

    afterEach(async () => {
        if (tmpRoot !== undefined) {
            await fs.rm(tmpRoot, { recursive: true, force: true });
        }
    });

    it('creates config.json under .lumpcode/lumps/<lumpName>/ when given .lumpcode/', async () => {
        tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'write-lump-config-json-'));
        const localConfigFolderPath = path.join(tmpRoot, '.lumpcode');

        const lumpDir = await writeLumpConfigJson({
            localConfigFolderPath,
            lumpName: 'alpha',
        });

        expect(lumpDir).toBe(path.join(localConfigFolderPath, 'lumps', 'alpha'));
        const onDisk = JSON.parse(await fs.readFile(path.join(lumpDir, 'config.json'), 'utf-8'));
        expect(onDisk).toEqual({ ...MINIMAL_RUNNABLE_LUMP_CONFIG });
    });

    it('creates parent directories when the lump dir is missing', async () => {
        tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'write-lump-config-json-'));
        const localConfigFolderPath = path.join(tmpRoot, '.lumpcode');

        const lumpDir = await writeLumpConfigJson({
            localConfigFolderPath,
            lumpName: 'nested-lump',
        });

        const st = await fs.stat(lumpDir);
        expect(st.isDirectory()).toBe(true);
        await expect(fs.access(path.join(lumpDir, 'config.json'))).resolves.toBeUndefined();
    });

    it('shallow-merges configOverrides over MINIMAL_RUNNABLE_LUMP_CONFIG', async () => {
        tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'write-lump-config-json-'));
        const localConfigFolderPath = path.join(tmpRoot, '.lumpcode');

        const lumpDir = await writeLumpConfigJson({
            localConfigFolderPath,
            lumpName: 'override',
            configOverrides: { discoveryBranch: 'main', disabled: true },
        });

        const onDisk = JSON.parse(await fs.readFile(path.join(lumpDir, 'config.json'), 'utf-8'));
        expect(onDisk).toEqual({
            ...MINIMAL_RUNNABLE_LUMP_CONFIG,
            discoveryBranch: 'main',
            disabled: true,
        });
    });

    it('returns the lump directory path', async () => {
        tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'write-lump-config-json-'));
        const localConfigFolderPath = path.join(tmpRoot, '.lumpcode');

        const lumpDir = await writeLumpConfigJson({
            localConfigFolderPath,
            lumpName: 'ret',
        });

        expect(lumpDir).toBe(path.join(localConfigFolderPath, 'lumps', 'ret'));
    });
});
