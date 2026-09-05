import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isProcessAlive, shellSingleQuote, type Logger } from '@lumpcode/core';

import {
    createIntegrationBranch,
    daemonConfigFileJson,
    initBareRemoteAndCheckout,
    writeLocalJson,
    writeProjectJson,
} from '../../testing';
import { createTempTestDirs, removeTempTestDirs } from '../createTempTestDirs';
import { daemonSchedulerFiles } from '../daemonSchedulerFiles';
import { daemonsDirPath } from '../daemonsDirPath';
import { DEFAULT_DAEMON_CRON_SETUP } from '../../consts';
import { execGit } from '../execGit';
import { acquireGitCommonDirLock, gitCommonDirLockFilePath } from '../gitCommonDirLock';
import { gitCommitAllAndPush } from '../gitCommitAllAndPush';
import { hashDaemonConfigFile, type DaemonConfigFile } from '../daemonConfigFile';
import { readDaemonMeta } from '../readDaemonMeta';
import { readJsonFile } from '../readJsonFile';
import { resolveGitCommonDir } from '../resolveGitCommonDir';
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

function mockSpawn(): typeof nodeSpawn {
    return vi.fn(() => ({ pid: 42_424, unref: vi.fn() })) as unknown as typeof nodeSpawn;
}

function daemonRelPath(daemonId = 'nightly'): string {
    return `.lumpcode/daemons/${daemonId}.json`;
}

describe('reconcileDaemonConfigFiles', () => {
    let projectRoot: string;
    let remoteDir: string;
    let globalConfigFolderPath: string;
    let localConfigFolderPath: string;
    let logger: Logger;
    const projectName = 'reconcile-start-proj';

    function frozenDedicated(
        overrides: Partial<ResolvedProjectLocalConfig> = {},
    ): ResolvedProjectLocalConfig {
        return {
            projectName,
            mode: 'dedicated',
            workspaceStrategy: 'checkout',
            primaryBranch: 'dev',
            ...overrides,
        };
    }

    async function runReconcile(overrides?: {
        spawnFn?: typeof nodeSpawn;
        frozen?: Partial<ResolvedProjectLocalConfig>;
    }) {
        const spawnFn = overrides?.spawnFn ?? mockSpawn();
        const result = await reconcileDaemonConfigFiles({
            projectRoot,
            projectName,
            frozenLocalConfig: frozenDedicated(overrides?.frozen),
            localConfigFolderPath,
            globalConfigFolderPath,
            logger,
            spawnFn,
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        return { result, spawnFn };
    }

    async function pushRecipe(
        extra: Omit<DaemonConfigFile, 'discoveryBranch'> = {},
        opts: { branch?: string; daemonId?: string } = {},
    ): Promise<void> {
        const branch = opts.branch ?? 'dev';
        const daemonId = opts.daemonId ?? 'nightly';
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: branch,
            extraFiles: {
                [daemonRelPath(daemonId)]: daemonConfigFileJson(branch, extra),
            },
        });
    }

    async function updateRemoteBranchFiles(input: {
        branchName?: string;
        files?: Record<string, string>;
        deletePaths?: string[];
    }): Promise<void> {
        const { branchName = 'dev', files = {}, deletePaths = [] } = input;
        execGit(`fetch origin ${branchName}`, projectRoot);
        execGit(`checkout ${branchName}`, projectRoot);
        for (const [rel, content] of Object.entries(files)) {
            const filePath = path.join(projectRoot, rel);
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, content, 'utf8');
        }
        for (const rel of deletePaths) {
            await fs.rm(path.join(projectRoot, rel), { force: true });
        }
        const stagePaths = [...Object.keys(files), ...deletePaths];
        if (stagePaths.length > 0) {
            execGit(`add -A -- ${stagePaths.join(' ')}`, projectRoot);
        }
        gitCommitAllAndPush({
            cwd: projectRoot,
            message: `update ${branchName} daemon recipes`,
            branch: branchName,
            stageAll: false,
        });
        execGit('checkout main', projectRoot);
    }

    type PlantedDaemonInput = {
        parsed?: DaemonConfigFile;
        daemonId?: string;
        inFlightLumpCount?: number;
        withDaemonConfigFile?: boolean;
    };

    async function plantFileLaunchedDaemon(
        input: PlantedDaemonInput = {},
    ): Promise<{ child: ChildProcess; pid: number }> {
        const parsed = input.parsed ?? { discoveryBranch: 'dev' };
        const daemonId = input.daemonId ?? 'nightly';
        const child = nodeSpawn(process.execPath, ['-e', 'setInterval(() => {}, 60000)'], {
            stdio: 'ignore',
        });
        const pid = child.pid;
        if (pid === undefined) {
            throw new Error('failed to spawn placeholder daemon process');
        }
        const files = daemonSchedulerFiles({
            daemonsDir: daemonsDirPath({ globalConfigFolderPath }),
            projectName,
            daemonId,
        });
        await fs.mkdir(path.dirname(files.pidFilePath), { recursive: true });
        await fs.writeFile(files.pidFilePath, String(pid), 'utf8');
        const meta: Record<string, unknown> = {
            daemonId,
            cronSetup: parsed.cronSetup ?? DEFAULT_DAEMON_CRON_SETUP,
            workspaceStrategy: 'checkout',
            ...(input.inFlightLumpCount !== undefined
                ? { inFlightLumpCount: input.inFlightLumpCount }
                : {}),
        };
        if (input.withDaemonConfigFile !== false) {
            meta.daemonConfigFile = {
                hash: hashDaemonConfigFile(parsed),
                discoveryBranch: parsed.discoveryBranch,
                path: daemonRelPath(daemonId),
            };
        }
        await fs.writeFile(files.metaFilePath, `${JSON.stringify(meta)}\n`, 'utf8');
        await fs.writeFile(
            files.desiredFilePath,
            `${JSON.stringify({
                projectRoot,
                daemonId,
                cronSetup: meta.cronSetup,
                ...(parsed.include !== undefined ? { include: parsed.include } : {}),
            })}\n`,
            'utf8',
        );
        return { child, pid };
    }

    async function killPlaceholder(child: ChildProcess): Promise<void> {
        if (child.exitCode !== null || child.signalCode !== null) {
            return;
        }
        child.kill('SIGKILL');
        await new Promise<void>((resolve) => {
            child.once('exit', () => resolve());
            setTimeout(resolve, 1000);
        });
    }

    async function withPlanted(
        input: PlantedDaemonInput,
        fn: (pid: number) => Promise<void>,
    ): Promise<void> {
        const { child, pid } = await plantFileLaunchedDaemon(input);
        try {
            await fn(pid);
        } finally {
            await killPlaceholder(child);
        }
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
        await pushRecipe({ include: ['alpha'] });

        const gitCommonDir = await resolveGitCommonDir({ cwd: projectRoot });
        expect(gitCommonDir.success).toBe(true);
        if (!gitCommonDir.success) throw new Error('unreachable');
        const lockPath = gitCommonDirLockFilePath({
            globalConfigFolderPath,
            gitCommonDir: gitCommonDir.data,
        });
        const spawnFn = vi.fn(() => {
            expect(existsSync(lockPath)).toBe(false);
            return { pid: 42_424, unref: vi.fn() };
        }) as unknown as typeof nodeSpawn;

        const { result } = await runReconcile({ spawnFn });
        expect(result.data.advanced).toBe(true);
        expect(spawnFn).toHaveBeenCalledOnce();

        const files = daemonSchedulerFiles({
            daemonsDir: daemonsDirPath({ globalConfigFolderPath }),
            projectName,
            daemonId: 'nightly',
        });
        const desired = await readJsonFile<{ daemonConfigFile?: unknown }>({
            filePath: files.desiredFilePath,
        });
        expect(desired.success).toBe(true);
        if (!desired.success) throw new Error('unreachable');
        expect(desired.data).toMatchObject({
            daemonId: 'nightly',
            include: ['alpha'],
            projectRoot,
        });
        expect(desired.data.daemonConfigFile).toBeUndefined();

        const meta = await readDaemonMeta(files.metaFilePath);
        expect(meta.success).toBe(true);
        if (!meta.success) throw new Error('unreachable');
        expect(meta.data.daemonConfigFile).toEqual({
            hash: hashDaemonConfigFile({ discoveryBranch: 'dev', include: ['alpha'] }),
            discoveryBranch: 'dev',
            path: daemonRelPath(),
        });
    });

    it('does not start a disabled file', async () => {
        await pushRecipe({ disabled: true });
        const { result, spawnFn } = await runReconcile();
        expect(result.data.advanced).toBe(true);
        expect(spawnFn).not.toHaveBeenCalled();
    });

    it('logs and skips when a CLI-owned id is already running (does not stay due)', async () => {
        await pushRecipe();
        await withPlanted({ withDaemonConfigFile: false }, async (pid) => {
            const { result, spawnFn } = await runReconcile();
            expect(result.data.advanced).toBe(true);
            expect(spawnFn).not.toHaveBeenCalled();
            expect(isProcessAlive(pid)).toBe(true);
            expect(logger.error).toHaveBeenCalledWith(
                expect.stringMatching(/without daemonConfigFile meta/),
            );
        });
    });

    it('does not start when checkout strategy and file sets maxParallelRun', async () => {
        await pushRecipe({ maxParallelRun: 2 });
        const { result, spawnFn } = await runReconcile({
            frozen: { workspaceStrategy: 'checkout' },
        });
        expect(result.data.advanced).toBe(true);
        expect(spawnFn).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(expect.stringMatching(/maxParallelRun/));
    });

    it('stays due when git common dir lock is busy', async () => {
        await pushRecipe();
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
            const { result, spawnFn } = await runReconcile();
            expect(result.data.advanced).toBe(false);
            expect(spawnFn).not.toHaveBeenCalled();
        } finally {
            await held.data();
        }
    });

    it('skips file reconcile for shared mode (advanced, no spawn)', async () => {
        await pushRecipe({ include: ['alpha'] });
        const { result, spawnFn } = await runReconcile({ frozen: { mode: 'shared' } });
        expect(result.data.advanced).toBe(true);
        expect(spawnFn).not.toHaveBeenCalled();
    });

    it('skips file reconcile when frozen local disabled is true', async () => {
        await pushRecipe({ include: ['alpha'] });
        const { result, spawnFn } = await runReconcile({ frozen: { disabled: true } });
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
        await pushRecipe({ include: ['agents'] }, { branch: 'feat/team-a', daemonId: 'agents' });
        // Leave HEAD on feat/team-a; recipe for agents is only on that remote ref.
        // Primary expand includes both; cwd working tree need not have the file.
        await fs.rm(path.join(projectRoot, '.lumpcode', 'daemons'), { recursive: true, force: true });

        const { result, spawnFn } = await runReconcile({
            frozen: { primaryBranches: ['dev', 'feat/*'] },
        });
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
        expect(meta.data.daemonConfigFile?.path).toBe(daemonRelPath('agents'));
    });

    it('stays due when fetch fails', async () => {
        await pushRecipe();
        execGit(
            `remote set-url origin ${shellSingleQuote(path.join(os.tmpdir(), 'lump-reconcile-no-such-origin'))}`,
            projectRoot,
        );

        const { result, spawnFn } = await runReconcile();
        expect(result.data.advanced).toBe(false);
        expect(spawnFn).not.toHaveBeenCalled();
    });

    it('no-ops when file-launched hash matches (no collision log)', async () => {
        const parsed = { discoveryBranch: 'dev', include: ['alpha'] };
        await pushRecipe({ include: ['alpha'] });
        await withPlanted({ parsed }, async (pid) => {
            const { result, spawnFn } = await runReconcile();
            expect(result.data.advanced).toBe(true);
            expect(spawnFn).not.toHaveBeenCalled();
            expect(isProcessAlive(pid)).toBe(true);
            expect(logger.error).not.toHaveBeenCalledWith(
                expect.stringMatching(/without daemonConfigFile meta/),
            );
        });
    });

    it('hash-restarts when normalized include changes', async () => {
        await pushRecipe({ include: ['alpha'] });
        await withPlanted({ parsed: { discoveryBranch: 'dev', include: ['alpha'] } }, async (pid) => {
            await updateRemoteBranchFiles({
                files: {
                    [daemonRelPath()]: daemonConfigFileJson('dev', { include: ['beta'] }),
                },
            });

            const { result, spawnFn } = await runReconcile();
            expect(result.data.advanced).toBe(true);
            expect(isProcessAlive(pid)).toBe(false);
            expect(spawnFn).toHaveBeenCalledOnce();

            const meta = await readDaemonMeta(
                daemonSchedulerFiles({
                    daemonsDir: daemonsDirPath({ globalConfigFolderPath }),
                    projectName,
                    daemonId: 'nightly',
                }).metaFilePath,
            );
            expect(meta.success).toBe(true);
            if (!meta.success) throw new Error('unreachable');
            expect(meta.data.daemonConfigFile).toEqual({
                hash: hashDaemonConfigFile({ discoveryBranch: 'dev', include: ['beta'] }),
                discoveryBranch: 'dev',
                path: daemonRelPath(),
            });
        });
    });

    it('does not restart on JSON key-order / empty-include equivalent change', async () => {
        await pushRecipe();
        await withPlanted({}, async (pid) => {
            await updateRemoteBranchFiles({
                files: {
                    // Same normalized hash: key order + empty include ≡ omit.
                    [daemonRelPath()]: '{\n  "include": [],\n  "discoveryBranch": "dev"\n}\n',
                },
            });

            const { result, spawnFn } = await runReconcile();
            expect(result.data.advanced).toBe(true);
            expect(spawnFn).not.toHaveBeenCalled();
            expect(isProcessAlive(pid)).toBe(true);
        });
    });

    it('graceful-stops file-launched when recipe is disabled', async () => {
        await pushRecipe();
        await withPlanted({}, async (pid) => {
            await updateRemoteBranchFiles({
                files: {
                    [daemonRelPath()]: daemonConfigFileJson('dev', { disabled: true }),
                },
            });

            const { result, spawnFn } = await runReconcile();
            expect(result.data.advanced).toBe(true);
            expect(spawnFn).not.toHaveBeenCalled();
            expect(isProcessAlive(pid)).toBe(false);
        });
    });

    it('graceful-stops file-launched when recipe is no longer considered (deleted)', async () => {
        await pushRecipe();
        await withPlanted({}, async (pid) => {
            await updateRemoteBranchFiles({
                deletePaths: [daemonRelPath()],
            });

            const { result, spawnFn } = await runReconcile();
            expect(result.data.advanced).toBe(true);
            expect(spawnFn).not.toHaveBeenCalled();
            expect(isProcessAlive(pid)).toBe(false);
        });
    });

    it('graceful-stops file-launched when recipe is no longer considered (expand drop)', async () => {
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: 'dev',
            extraFiles: {},
        });
        await pushRecipe({ include: ['agents'] }, { branch: 'feat/team-a', daemonId: 'agents' });
        await withPlanted(
            {
                daemonId: 'agents',
                parsed: { discoveryBranch: 'feat/team-a', include: ['agents'] },
            },
            async (pid) => {
                const { result, spawnFn } = await runReconcile({
                    frozen: { primaryBranch: 'dev' },
                });
                expect(result.data.advanced).toBe(true);
                expect(spawnFn).not.toHaveBeenCalled();
                expect(isProcessAlive(pid)).toBe(false);
            },
        );
    });

    it('never stops a CLI-started daemon when its recipe is gone', async () => {
        await pushRecipe();
        await withPlanted({ withDaemonConfigFile: false }, async (pid) => {
            await updateRemoteBranchFiles({
                deletePaths: [daemonRelPath()],
            });

            const { result, spawnFn } = await runReconcile();
            expect(result.data.advanced).toBe(true);
            expect(spawnFn).not.toHaveBeenCalled();
            expect(isProcessAlive(pid)).toBe(true);
        });
    });

    it('stays due when graceful stop hits daemonBusy', async () => {
        await pushRecipe();
        await withPlanted({ inFlightLumpCount: 1 }, async (pid) => {
            await updateRemoteBranchFiles({
                files: {
                    [daemonRelPath()]: daemonConfigFileJson('dev', { disabled: true }),
                },
            });

            const { result, spawnFn } = await runReconcile();
            expect(result.data.advanced).toBe(false);
            expect(spawnFn).not.toHaveBeenCalled();
            expect(isProcessAlive(pid)).toBe(true);
        });
    });

    it('stops and does not restart when hash changes into checkout + maxParallelRun', async () => {
        await pushRecipe({ include: ['alpha'] });
        await withPlanted({ parsed: { discoveryBranch: 'dev', include: ['alpha'] } }, async (pid) => {
            await updateRemoteBranchFiles({
                files: {
                    [daemonRelPath()]: daemonConfigFileJson('dev', {
                        include: ['alpha'],
                        maxParallelRun: 2,
                    }),
                },
            });

            const { result, spawnFn } = await runReconcile({
                frozen: { workspaceStrategy: 'checkout' },
            });
            expect(result.data.advanced).toBe(true);
            expect(spawnFn).not.toHaveBeenCalled();
            expect(isProcessAlive(pid)).toBe(false);
            expect(logger.error).toHaveBeenCalledWith(
                expect.stringMatching(/maxParallelRun/),
            );
        });
    });
});
