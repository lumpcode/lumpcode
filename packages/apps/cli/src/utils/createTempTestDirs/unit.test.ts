import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pathExists } from '@lumpcode/core';

import { createTempTestDirs, removeTempTestDirs } from './main';

describe('createTempTestDirs', () => {
    it('defaults to project + remote + global and mkdirs localConfigFolderPath', async () => {
        const dirs = await createTempTestDirs({ prefix: 'lump-cttd-default-' });
        try {
            expect(path.basename(dirs.projectRoot)).toMatch(/^lump-cttd-default-/);
            expect(dirs.localConfigFolderPath).toBe(path.join(dirs.projectRoot, '.lumpcode'));
            expect(await pathExists(dirs.localConfigFolderPath)).toBe(true);
            expect(dirs.remoteDir).toBeDefined();
            expect(path.basename(dirs.remoteDir!)).toMatch(/^lump-cttd-default-remote-/);
            expect(dirs.globalConfigFolderPath).toBeDefined();
            expect(path.basename(dirs.globalConfigFolderPath!)).toMatch(/^lump-cttd-default-global-/);
        } finally {
            await removeTempTestDirs(dirs);
        }
    });

    it('omits remoteDir when remote is false', async () => {
        const dirs = await createTempTestDirs({ prefix: 'lump-cttd-noremote-', remote: false });
        try {
            expect(dirs.remoteDir).toBeUndefined();
            expect(dirs.globalConfigFolderPath).toBeDefined();
            expect(await pathExists(dirs.localConfigFolderPath)).toBe(true);
        } finally {
            await removeTempTestDirs(dirs);
        }
    });

    it('omits globalConfigFolderPath when global is false', async () => {
        const dirs = await createTempTestDirs({ prefix: 'lump-cttd-noglobal-', global: false });
        try {
            expect(dirs.globalConfigFolderPath).toBeUndefined();
            expect(dirs.remoteDir).toBeDefined();
            expect(await pathExists(dirs.localConfigFolderPath)).toBe(true);
        } finally {
            await removeTempTestDirs(dirs);
        }
    });

    it('skips mkdir when mkdirLocalConfig is false', async () => {
        const dirs = await createTempTestDirs({
            prefix: 'lump-cttd-nomkdir-',
            mkdirLocalConfig: false,
            remote: false,
            global: false,
        });
        try {
            expect(await pathExists(dirs.localConfigFolderPath)).toBe(false);
            expect(dirs.localConfigFolderPath).toBe(path.join(dirs.projectRoot, '.lumpcode'));
        } finally {
            await removeTempTestDirs(dirs);
        }
    });

    it('uses -remote- / -global- when prefix has no trailing dash', async () => {
        const dirs = await createTempTestDirs({ prefix: 'lump-cttd-nodash' });
        try {
            expect(path.basename(dirs.remoteDir!)).toMatch(/^lump-cttd-nodash-remote-/);
            expect(path.basename(dirs.globalConfigFolderPath!)).toMatch(/^lump-cttd-nodash-global-/);
        } finally {
            await removeTempTestDirs(dirs);
        }
    });
});

describe('removeTempTestDirs', () => {
    it('deletes provided roots and ignores missing optional paths', async () => {
        const dirs = await createTempTestDirs({ prefix: 'lump-cttd-rm-' });
        const { projectRoot, remoteDir, globalConfigFolderPath } = dirs;
        await removeTempTestDirs({ projectRoot, remoteDir, globalConfigFolderPath });
        expect(await pathExists(projectRoot)).toBe(false);
        expect(await pathExists(remoteDir!)).toBe(false);
        expect(await pathExists(globalConfigFolderPath!)).toBe(false);

        await expect(
            removeTempTestDirs({ projectRoot, remoteDir, globalConfigFolderPath }),
        ).resolves.toBeUndefined();
    });

    it('removes only projectRoot when optional roots are omitted', async () => {
        const dirs = await createTempTestDirs({
            prefix: 'lump-cttd-rm-partial-',
            remote: false,
            global: false,
        });
        await removeTempTestDirs({ projectRoot: dirs.projectRoot });
        expect(await pathExists(dirs.projectRoot)).toBe(false);
    });
});
