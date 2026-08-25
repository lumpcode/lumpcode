import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createDaemonCommandTestProject } from './createDaemonCommandTestProject';
import {
    getDaemonTestGlobalConfigFolder,
    setDaemonTestGlobalConfigFolder,
} from './daemonTestEnv';
import { removeTempTestDirs } from '../utils';

describe('createDaemonCommandTestProject', () => {
    let projectRoot: string | undefined;
    let globalConfigFolderPath: string | undefined;

    afterEach(async () => {
        if (projectRoot !== undefined && globalConfigFolderPath !== undefined) {
            await removeTempTestDirs({ projectRoot, globalConfigFolderPath });
            projectRoot = undefined;
            globalConfigFolderPath = undefined;
        }
    });

    it('scaffolds a dedicated project with alpha lump, project.json, local.json, and README', async () => {
        const result = await createDaemonCommandTestProject({
            prefix: 'lump-daemon-cmd-fixture-',
            projectName: 'fixture-project',
        });
        projectRoot = result.projectRoot;
        globalConfigFolderPath = result.globalConfigFolderPath;

        expect(result).toEqual({
            projectRoot: expect.any(String),
            globalConfigFolderPath: expect.any(String),
            localConfigFolderPath: path.join(result.projectRoot, '.lumpcode'),
            projectName: 'fixture-project',
        });
        expect(getDaemonTestGlobalConfigFolder()).toBe(result.globalConfigFolderPath);

        await expect(fs.access(path.join(result.projectRoot, '.git'))).resolves.toBeUndefined();
        await expect(
            fs.access(path.join(result.localConfigFolderPath, 'lumps', 'alpha', 'config.json')),
        ).resolves.toBeUndefined();

        const projectJson = JSON.parse(
            await fs.readFile(path.join(result.localConfigFolderPath, 'project.json'), 'utf-8'),
        );
        expect(projectJson).toEqual({ projectName: 'fixture-project' });

        const localJson = JSON.parse(
            await fs.readFile(path.join(result.localConfigFolderPath, 'local.json'), 'utf-8'),
        );
        expect(localJson).toEqual({ mode: 'dedicated', primaryBranch: 'main' });

        expect(await fs.readFile(path.join(result.projectRoot, 'README.md'), 'utf-8')).toBe('# test\n');
    });

    it('honors lumpName and skips daemon env binding when bindDaemonTestEnv is false', async () => {
        setDaemonTestGlobalConfigFolder('sentinel-unbound');

        const result = await createDaemonCommandTestProject({
            prefix: 'lump-daemon-cmd-fixture-',
            projectName: 'no-bind-project',
            lumpName: 'beta',
            bindDaemonTestEnv: false,
        });
        projectRoot = result.projectRoot;
        globalConfigFolderPath = result.globalConfigFolderPath;

        expect(getDaemonTestGlobalConfigFolder()).toBe('sentinel-unbound');
        await expect(
            fs.access(path.join(result.localConfigFolderPath, 'lumps', 'beta', 'config.json')),
        ).resolves.toBeUndefined();
        await expect(
            fs.access(path.join(result.localConfigFolderPath, 'lumps', 'alpha', 'config.json')),
        ).rejects.toMatchObject({ code: 'ENOENT' });
    });
});
