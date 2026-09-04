import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { spawn as nodeSpawn } from 'node:child_process';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Logger } from '@lumpcode/core';

import { createIntegrationBranch, initBareRemoteAndCheckout, writeLocalJson, writeProjectJson } from '../../testing';
import { createTempTestDirs, removeTempTestDirs } from '../createTempTestDirs';
import { daemonSchedulerFiles } from '../daemonSchedulerFiles';
import { daemonsDirPath } from '../daemonsDirPath';
import { acquireGitCommonDirLock } from '../gitCommonDirLock';
import { hashDaemonConfigFile } from '../daemonConfigFile';
import { readDaemonMeta } from '../readDaemonMeta';
import { readJsonFile } from '../readJsonFile';
import type { ResolvedProjectLocalConfig } from '../../types/ResolvedProjectLocalConfig';
import { reconcileDaemonConfigFiles } from './main';

function createLogger(): Logger {
    return {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        verbose: vi.fn(),
        child: () => createLogger(),
    };
}

function daemonJson(discoveryBranch: string, extra: Record<string, unknown> = {}): string {
    return `${JSON.stringify({ discoveryBranch, ...extra }, null, 2)}\n`;
}

function mockSpawn(): typeof nodeSpawn {
    return vi.fn(() => ({ pid: 42_424, unref: vi.fn() })) as unknown as typeof nodeSpawn;
}

describe('reconcileDaemonConfigFiles', () => {
    let projectRoot: string;
    let remoteDir: string;
    let globalConfigFolderPath: string;
    let localConfigFolderPath: string;
    let logger: Logger;
    const projectName = 'reconcile-start-proj';

    async function frozenDedicated(
        overrides: Partial<ResolvedProjectLocalConfig> = {},
    ): Promise<ResolvedProjectLocalConfig> {
        return {
            projectName,
            mode: 'dedicated',
            workspaceStrategy: 'checkout',
            primaryBranch: 'dev',
            ...overrides,
        };
    }

    beforeEach(async () => {
        ({ projectRoot, remoteDir, globalConfigFolderPath, localConfigFolderPath } =
            await createTempTestDirs({
                prefix: 'lump-reconcile-daemon-cfg-',
            }));
        initBareRemoteAndCheckout(projectRoot, remoteDir);
        await writeProjectJson(localConfigFolderPath, { projectName });
        await writeLocalJson(localConfigFolderPath, {
            mode: 'dedicated',
            primaryBranch: 'dev',
            workspaceStrategy: 'checkout',
        });
        logger = createLogger();
    });

    afterEach(async () => {
        await removeTempTestDirs({ projectRoot, remoteDir, globalConfigFolderPath });
    });

    it('starts an enabled considered file with daemonConfigFile meta', async () => {
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: 'dev',
            extraFiles: {
                '.lumpcode/daemons/nightly.json': daemonJson('dev', { include: ['alpha'] }),
            },
        });

        const spawnFn = mockSpawn();
        const result = await reconcileDaemonConfigFiles({
            projectRoot,
            projectName,
            frozenLocalConfig: await frozenDedicated(),
            localConfigFolderPath,
            globalConfigFolderPath,
            logger,
            spawnFn,
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.advanced).toBe(true);
        expect(spawnFn).toHaveBeenCalledOnce();

        const files = daemonSchedulerFiles({
            daemonsDir: daemonsDirPath({ globalConfigFolderPath }),
            projectName,
            daemonId: 'nightly',
        });
        const desired = await readJsonFile({ filePath: files.desiredFilePath });
        expect(desired.success).toBe(true);
        if (!desired.success) throw new Error('unreachable');
        expect(desired.data).toMatchObject({
            daemonId: 'nightly',
            include: ['alpha'],
            projectRoot,
        });
        expect((desired.data as { daemonConfigFile?: unknown }).daemonConfigFile).toBeUndefined();

        const meta = await readDaemonMeta(files.metaFilePath);
        expect(meta.success).toBe(true);
        if (!meta.success) throw new Error('unreachable');
        expect(meta.data.daemonConfigFile).toEqual({
            hash: hashDaemonConfigFile({ discoveryBranch: 'dev', include: ['alpha'] }),
            discoveryBranch: 'dev',
            path: '.lumpcode/daemons/nightly.json',
        });
    });

    it('does not start a disabled file', async () => {
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: 'dev',
            extraFiles: {
                '.lumpcode/daemons/nightly.json': daemonJson('dev', { disabled: true }),
            },
        });

        const spawnFn = mockSpawn();
        const result = await reconcileDaemonConfigFiles({
            projectRoot,
            projectName,
            frozenLocalConfig: await frozenDedicated(),
            localConfigFolderPath,
            globalConfigFolderPath,
            logger,
            spawnFn,
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.advanced).toBe(true);
        expect(spawnFn).not.toHaveBeenCalled();
    });

    it('logs and skips when a CLI-owned id is already running (does not stay due)', async () => {
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: 'dev',
            extraFiles: {
                '.lumpcode/daemons/nightly.json': daemonJson('dev'),
            },
        });

        const child = nodeSpawn(process.execPath, ['-e', 'setInterval(() => {}, 60000)'], {
            stdio: 'ignore',
        });
        const pid = child.pid;
        if (pid === undefined) {
            throw new Error('failed to spawn placeholder daemon process');
        }
        try {
            const files = daemonSchedulerFiles({
                daemonsDir: daemonsDirPath({ globalConfigFolderPath }),
                projectName,
                daemonId: 'nightly',
            });
            await fs.mkdir(path.dirname(files.pidFilePath), { recursive: true });
            await fs.writeFile(files.pidFilePath, String(pid), 'utf8');
            await fs.writeFile(
                files.metaFilePath,
                `${JSON.stringify({
                    daemonId: 'nightly',
                    cronSetup: '*/5 * * * *',
                    workspaceStrategy: 'checkout',
                })}\n`,
                'utf8',
            );

            const spawnFn = mockSpawn();
            const result = await reconcileDaemonConfigFiles({
                projectRoot,
                projectName,
                frozenLocalConfig: await frozenDedicated(),
                localConfigFolderPath,
                globalConfigFolderPath,
                logger,
                spawnFn,
            });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(result.data.advanced).toBe(true);
            expect(spawnFn).not.toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith(
                expect.stringMatching(/without daemonConfigFile meta/),
            );
        } finally {
            child.kill('SIGKILL');
            await new Promise<void>((resolve) => {
                child.once('exit', () => resolve());
                // Avoid hanging if the process is already gone.
                setTimeout(resolve, 1000);
            });
        }
    });

    it('does not start when checkout strategy and file sets maxParallelRun', async () => {
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: 'dev',
            extraFiles: {
                '.lumpcode/daemons/nightly.json': daemonJson('dev', { maxParallelRun: 2 }),
            },
        });

        const spawnFn = mockSpawn();
        const result = await reconcileDaemonConfigFiles({
            projectRoot,
            projectName,
            frozenLocalConfig: await frozenDedicated({ workspaceStrategy: 'checkout' }),
            localConfigFolderPath,
            globalConfigFolderPath,
            logger,
            spawnFn,
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.advanced).toBe(true);
        expect(spawnFn).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(expect.stringMatching(/maxParallelRun/));
    });

    it('stays due when git common dir lock is busy', async () => {
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: 'dev',
            extraFiles: {
                '.lumpcode/daemons/nightly.json': daemonJson('dev'),
            },
        });

        const held = await acquireGitCommonDirLock({
            globalConfigFolderPath,
            gitCwd: projectRoot,
            lumpName: 'holder',
            lockMode: 'fail',
            projectName,
        });
        expect(held.success).toBe(true);
        if (!held.success) throw new Error('unreachable');

        try {
            const spawnFn = mockSpawn();
            const result = await reconcileDaemonConfigFiles({
                projectRoot,
                projectName,
                frozenLocalConfig: await frozenDedicated(),
                localConfigFolderPath,
                globalConfigFolderPath,
                logger,
                spawnFn,
            });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(result.data.advanced).toBe(false);
            expect(spawnFn).not.toHaveBeenCalled();
        } finally {
            await held.data();
        }
    });

    it('skips file reconcile for shared mode (advanced, no spawn)', async () => {
        const spawnFn = mockSpawn();
        const result = await reconcileDaemonConfigFiles({
            projectRoot,
            projectName,
            frozenLocalConfig: await frozenDedicated({ mode: 'shared' }),
            localConfigFolderPath,
            globalConfigFolderPath,
            logger,
            spawnFn,
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.advanced).toBe(true);
        expect(spawnFn).not.toHaveBeenCalled();
    });

    it('skips file reconcile when frozen local disabled is true', async () => {
        const spawnFn = mockSpawn();
        const result = await reconcileDaemonConfigFiles({
            projectRoot,
            projectName,
            frozenLocalConfig: await frozenDedicated({ disabled: true }),
            localConfigFolderPath,
            globalConfigFolderPath,
            logger,
            spawnFn,
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.advanced).toBe(true);
        expect(spawnFn).not.toHaveBeenCalled();
    });

    it('starts from origin ls-tree/show when the working-tree recipe is gone', async () => {
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: 'dev',
            extraFiles: {},
        });
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: 'feat/team-a',
            extraFiles: {
                '.lumpcode/daemons/agents.json': daemonJson('feat/team-a', { include: ['agents'] }),
            },
        });
        // Leave HEAD on feat/team-a; recipe for agents is only on that remote ref.
        // Primary expand includes both; cwd working tree need not have the file.
        await fs.rm(path.join(projectRoot, '.lumpcode', 'daemons'), { recursive: true, force: true });

        const spawnFn = mockSpawn();
        const result = await reconcileDaemonConfigFiles({
            projectRoot,
            projectName,
            frozenLocalConfig: await frozenDedicated({
                primaryBranches: ['dev', 'feat/*'],
            }),
            localConfigFolderPath,
            globalConfigFolderPath,
            logger,
            spawnFn,
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.advanced).toBe(true);
        expect(spawnFn).toHaveBeenCalledOnce();

        const meta = await readDaemonMeta(
            daemonSchedulerFiles({
                daemonsDir: daemonsDirPath({ globalConfigFolderPath }),
                projectName,
                daemonId: 'agents',
            }).metaFilePath,
        );
        expect(meta.success).toBe(true);
        if (!meta.success) throw new Error('unreachable');
        expect(meta.data.daemonConfigFile?.discoveryBranch).toBe('feat/team-a');
        expect(meta.data.daemonConfigFile?.path).toBe('.lumpcode/daemons/agents.json');
    });
});
