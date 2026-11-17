import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn as nodeSpawn } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isProcessAlive } from '@lumpcode/core';

import { noopLogger } from '../noopLogger';
import { writeJsonFile } from '../writeJsonFile';
import { writeStartDaemonDesired } from '../startDaemonDesired';
import { runSuperviseLocalPass } from './main';

describe('runSuperviseLocalPass', () => {
    let tmp: string;
    let projectRoot: string;
    let daemonsDir: string;
    const projectName = 'demo_proj';

    beforeEach(async () => {
        tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-local-pass-'));
        projectRoot = path.join(tmp, 'proj');
        daemonsDir = path.join(tmp, 'daemons');
        await fs.mkdir(path.join(projectRoot, '.lumpcode'), { recursive: true });
        await fs.mkdir(daemonsDir, { recursive: true });
        await writeJsonFile({
            filePath: path.join(projectRoot, '.lumpcode', 'project.json'),
            data: { projectName },
        });
        await writeJsonFile({
            filePath: path.join(projectRoot, '.lumpcode', 'local.json'),
            data: { mode: 'dedicated', primaryBranch: 'main', workspaceStrategy: 'worktree' },
        });
    });

    afterEach(async () => {
        await fs.rm(tmp, { recursive: true, force: true });
    });

    async function writeDesiredAndMeta(input: {
        daemonId: string;
        cronSetup: string;
        workspaceStrategy: 'checkout' | 'worktree';
        include?: string[];
    }): Promise<{ desiredFilePath: string; metaFilePath: string }> {
        const desiredFilePath = path.join(daemonsDir, `${projectName}.${input.daemonId}.daemon.desired.json`);
        const metaFilePath = path.join(daemonsDir, `${projectName}.${input.daemonId}.daemon.meta.json`);
        await writeStartDaemonDesired({
            desiredFilePath,
            desired: {
                projectRoot,
                daemonId: input.daemonId,
                cronSetup: input.cronSetup,
                include: input.include,
            },
        });
        await writeJsonFile({
            filePath: metaFilePath,
            data: {
                daemonId: input.daemonId,
                cronSetup: input.cronSetup,
                workspaceStrategy: input.workspaceStrategy,
                include: input.include,
            },
            trailingNewline: true,
        });
        return { desiredFilePath, metaFilePath };
    }

    it('spawns start --foreground when desired is present and no live pid', async () => {
        await writeDesiredAndMeta({
            daemonId: 'global',
            cronSetup: '*/7 * * * *',
            workspaceStrategy: 'worktree',
            include: ['backlog'],
        });
        const spawnFn = vi.fn(() => ({ pid: 4242, unref: vi.fn() })) as unknown as typeof nodeSpawn;
        const result = await runSuperviseLocalPass({
            projectName,
            projectRoot,
            daemonsDir,
            logger: noopLogger,
            spawnFn,
        });
        expect(result.success).toBe(true);
        expect(spawnFn).toHaveBeenCalledOnce();
        const args = spawnFn.mock.calls[0]![1] as string[];
        expect(args).toContain('start');
        expect(args).toContain('--foreground');
        expect(args).toContain('*/7 * * * *');
        expect((await fs.readFile(path.join(daemonsDir, `${projectName}.global.daemon.pid`), 'utf8')).trim()).toBe(
            '4242',
        );
    });

    it('respawns with meta workspaceStrategy, not live local.json', async () => {
        const { metaFilePath } = await writeDesiredAndMeta({
            daemonId: 'agents',
            cronSetup: '*/5 * * * *',
            workspaceStrategy: 'checkout',
        });
        // local.json is worktree; meta is checkout — respawn must keep checkout
        const spawnFn = vi.fn(() => ({ pid: 5151, unref: vi.fn() })) as unknown as typeof nodeSpawn;
        const result = await runSuperviseLocalPass({
            projectName,
            projectRoot,
            daemonsDir,
            logger: noopLogger,
            spawnFn,
        });
        expect(result.success).toBe(true);
        expect(spawnFn).toHaveBeenCalledOnce();
        const stubMeta = JSON.parse(await fs.readFile(metaFilePath, 'utf8')) as {
            workspaceStrategy: string;
        };
        expect(stubMeta.workspaceStrategy).toBe('checkout');
    });

    it('skips spawn when meta is missing', async () => {
        await writeStartDaemonDesired({
            desiredFilePath: path.join(daemonsDir, `${projectName}.global.daemon.desired.json`),
            desired: {
                projectRoot,
                daemonId: 'global',
                cronSetup: '*/7 * * * *',
            },
        });
        const warn = vi.fn();
        const spawnFn = vi.fn() as unknown as typeof nodeSpawn;
        const result = await runSuperviseLocalPass({
            projectName,
            projectRoot,
            daemonsDir,
            logger: { ...noopLogger, warn },
            spawnFn,
        });
        expect(result.success).toBe(true);
        expect(spawnFn).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/skip spawn for "global".*meta missing/));
        await expect(fs.access(path.join(daemonsDir, `${projectName}.global.daemon.pid`))).rejects.toMatchObject({
            code: 'ENOENT',
        });
    });

    it('skips spawn when meta is invalid', async () => {
        await writeStartDaemonDesired({
            desiredFilePath: path.join(daemonsDir, `${projectName}.global.daemon.desired.json`),
            desired: {
                projectRoot,
                daemonId: 'global',
                cronSetup: '*/7 * * * *',
            },
        });
        await fs.writeFile(
            path.join(daemonsDir, `${projectName}.global.daemon.meta.json`),
            '{ not valid json',
            'utf8',
        );
        const warn = vi.fn();
        const spawnFn = vi.fn() as unknown as typeof nodeSpawn;
        const result = await runSuperviseLocalPass({
            projectName,
            projectRoot,
            daemonsDir,
            logger: { ...noopLogger, warn },
            spawnFn,
        });
        expect(result.success).toBe(true);
        expect(spawnFn).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/skip spawn for "global".*meta invalid/));
    });

    it('deletes leftover desired when stopping and the pid is gone', async () => {
        const desiredFilePath = path.join(daemonsDir, `${projectName}.agents.daemon.desired.json`);
        await writeStartDaemonDesired({
            desiredFilePath,
            desired: {
                projectRoot,
                daemonId: 'agents',
                cronSetup: '*/5 * * * *',
                stopping: true,
            },
        });
        const result = await runSuperviseLocalPass({
            projectName,
            projectRoot,
            daemonsDir,
            logger: noopLogger,
        });
        expect(result.success).toBe(true);
        await expect(fs.access(desiredFilePath)).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('adopts a live unstamped daemon into desired.json', async () => {
        const pidFilePath = path.join(daemonsDir, `${projectName}.global.daemon.pid`);
        const metaFilePath = path.join(daemonsDir, `${projectName}.global.daemon.meta.json`);
        await fs.writeFile(pidFilePath, String(process.pid), 'utf8');
        await writeJsonFile({
            filePath: metaFilePath,
            data: {
                daemonId: 'global',
                cronSetup: '*/9 * * * *',
                workspaceStrategy: 'checkout',
            },
            trailingNewline: true,
        });
        const spawnFn = vi.fn() as unknown as typeof nodeSpawn;
        const result = await runSuperviseLocalPass({
            projectName,
            projectRoot,
            daemonsDir,
            logger: noopLogger,
            spawnFn,
        });
        expect(result.success).toBe(true);
        expect(spawnFn).not.toHaveBeenCalled();
        const desired = JSON.parse(
            await fs.readFile(path.join(daemonsDir, `${projectName}.global.daemon.desired.json`), 'utf8'),
        ) as { daemonId: string; cronSetup: string };
        expect(desired.daemonId).toBe('global');
        expect(desired.cronSetup).toBe('*/9 * * * *');
        const meta = JSON.parse(await fs.readFile(metaFilePath, 'utf8')) as { cronSetup: string };
        expect(meta.cronSetup).toBe('*/9 * * * *');
    });

    async function waitForFile(filePath: string): Promise<string> {
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
            try {
                return await fs.readFile(filePath, 'utf8');
            } catch {
                await new Promise((resolve) => setTimeout(resolve, 20));
            }
        }
        throw new Error(`timed out waiting for ${filePath}`);
    }

    async function waitUntilDead(pid: number): Promise<void> {
        const deadline = Date.now() + 5000;
        while (isProcessAlive(pid, { onProbeError: 'dead' })) {
            if (Date.now() > deadline) throw new Error(`pid ${pid} still alive`);
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    /** Detached leader exits and leaves a child in its process group. */
    async function orphanedProcessGroup(): Promise<{ leaderPid: number; childPid: number }> {
        const readyFile = path.join(tmp, `group-ready-${Date.now()}`);
        const parent = nodeSpawn(
            process.execPath,
            [
                '-e',
                `
                const { spawn } = require('child_process');
                const fs = require('fs');
                const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000000)'], { stdio: 'ignore' });
                child.unref();
                fs.writeFileSync(process.argv[1], JSON.stringify({ leader: process.pid, child: child.pid }));
                setTimeout(() => process.exit(0), 50);
                `,
                readyFile,
            ],
            { detached: true, stdio: 'ignore' },
        );
        parent.unref();
        const parsed = JSON.parse(await waitForFile(readyFile)) as { leader: number; child: number };
        await waitUntilDead(parsed.leader);
        return { leaderPid: parsed.leader, childPid: parsed.child };
    }

    it.skipIf(process.platform === 'win32')(
        'kills the dead daemon process group before spawning a replacement',
        async () => {
            const { leaderPid, childPid } = await orphanedProcessGroup();
            try {
                await writeDesiredAndMeta({
                    daemonId: 'global',
                    cronSetup: '*/7 * * * *',
                    workspaceStrategy: 'worktree',
                });
                await fs.writeFile(
                    path.join(daemonsDir, `${projectName}.global.daemon.pid`),
                    String(leaderPid),
                    'utf8',
                );
                const spawnFn = vi.fn(() => ({ pid: 4242, unref: vi.fn() })) as unknown as typeof nodeSpawn;
                const result = await runSuperviseLocalPass({
                    projectName,
                    projectRoot,
                    daemonsDir,
                    logger: noopLogger,
                    spawnFn,
                });
                expect(result.success).toBe(true);
                expect(spawnFn).toHaveBeenCalledOnce();
                await waitUntilDead(childPid);
            } finally {
                try {
                    process.kill(childPid, 'SIGKILL');
                } catch {
                    // already dead
                }
            }
        },
    );

    it.skipIf(process.platform === 'win32')(
        'kills the dead daemon process group when stopping, without spawning',
        async () => {
            const group = await orphanedProcessGroup();
            const desiredFilePath = path.join(daemonsDir, `${projectName}.agents.daemon.desired.json`);
            try {
                await writeStartDaemonDesired({
                    desiredFilePath,
                    desired: {
                        projectRoot,
                        daemonId: 'agents',
                        cronSetup: '*/5 * * * *',
                        stopping: true,
                    },
                });
                await fs.writeFile(
                    path.join(daemonsDir, `${projectName}.agents.daemon.pid`),
                    String(group.leaderPid),
                    'utf8',
                );
                const spawnFn = vi.fn() as unknown as typeof nodeSpawn;
                const result = await runSuperviseLocalPass({
                    projectName,
                    projectRoot,
                    daemonsDir,
                    logger: noopLogger,
                    spawnFn,
                });
                expect(result.success).toBe(true);
                expect(spawnFn).not.toHaveBeenCalled();
                await waitUntilDead(group.childPid);
                await expect(fs.access(desiredFilePath)).rejects.toMatchObject({ code: 'ENOENT' });
            } finally {
                try {
                    process.kill(group.childPid, 'SIGKILL');
                } catch {
                    // already dead
                }
            }
        },
    );
});
