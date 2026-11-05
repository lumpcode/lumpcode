import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    aliveDaemonSpawnFn,
    createDaemonCommandTestProject,
    removeDaemonMetaUntilGone,
    waitForAliveDaemonChildMeta,
    waitForDaemonPidFile,
    writeDaemonMetaSticky,
} from '../../testing';
import type { Logger } from '@lumpcode/core';

import { daemonSchedulerFiles } from '../../utils/daemonSchedulerFiles';
import { pollUntil } from '../../utils/pollUntil';
import { supervisorMetaPath, supervisorPidPath } from '../../utils/supervisorPaths';
import { command as startCommand } from '../start/main';
import { command as stopCommand } from './main';
import { stopAllProjectDaemons } from './stopAllProjectDaemons';
import { writeJsonFile, removeTempTestDirs } from '../../utils';
describe('stop command', () => {
    let projectRoot: string;
    let globalConfigFolderPath: string;
    let localConfigFolderPath: string;
    const projectName = 'stop-test-project';
    const schedulerFiles = () =>
        daemonSchedulerFiles({
            daemonsDir: path.join(globalConfigFolderPath, 'daemons'),
            projectName,
            daemonId: 'global',
        });
    const pidPath = () => schedulerFiles().pidFilePath;

    function metaInFlightRuns(count: number) {
        return Array.from({ length: count }, (_, i) => ({ lumpName: `in-flight-${i + 1}` }));
    }

    beforeEach(async () => {
        ({ projectRoot, globalConfigFolderPath, localConfigFolderPath } = await createDaemonCommandTestProject({ prefix: 'lump-stop-', projectName }));
    });
    afterEach(async () => {
        await removeTempTestDirs({ projectRoot, globalConfigFolderPath });
    });
    function makeStopHandler() {
        return stopCommand.handlerMaker({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
        });
    }
    async function runStart(spawnFn: typeof aliveDaemonSpawnFn) {
        const handle = startCommand.handlerMaker({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            spawnFn,
            skipEnsureSupervisor: true,
        });
        const result = await handle({ options: {}, arguments: {} });
        expect(result.success).toBe(true);
    }
    it('fails when there is no PID file', async () => {
        const result = await makeStopHandler()({ options: {}, arguments: {} });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages[0]).toContain('No daemon PID file');
    });
    it('cleans up stale PID when the daemon process is gone', async () => {
        await fs.mkdir(path.dirname(pidPath()), { recursive: true });
        await fs.writeFile(pidPath(), '999999999\n', 'utf8');
        const result = await makeStopHandler()({ options: {}, arguments: {} });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages[0]).toMatch(/not running|removed stale/i);
        await expect(fs.access(pidPath())).rejects.toMatchObject({ code: 'ENOENT' });
    });
    it('stops the daemon started by the start command and removes the PID file', async () => {
        await runStart(aliveDaemonSpawnFn);
        await waitForDaemonPidFile(pidPath());
        await waitForAliveDaemonChildMeta(schedulerFiles().metaFilePath);
        const raw = await fs.readFile(pidPath(), 'utf8');
        const pid = Number.parseInt(raw.trim(), 10);
        expect(Number.isNaN(pid)).toBe(false);
        const result = await makeStopHandler()({ options: {}, arguments: {} });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.messages[0]).toContain('Stopped Lumpcode daemon');
        await expect(fs.access(pidPath())).rejects.toMatchObject({ code: 'ENOENT' });
        try {
            process.kill(pid, 0);
            throw new Error('expected child to be dead');
        } catch (e) {
            expect(e).toMatchObject({ code: 'ESRCH' });
        }
    });

    it('refuses --all together with --daemonId', async () => {
        const result = await makeStopHandler()({
            options: { all: true, daemonId: 'global' },
            arguments: {},
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages[0]).toMatch(/--all and --daemonId/);
    });

    it('stop --all stops a running daemon and removes desired.json', async () => {
        await runStart(aliveDaemonSpawnFn);
        await waitForDaemonPidFile(pidPath());
        await waitForAliveDaemonChildMeta(schedulerFiles().metaFilePath);
        const desiredPath = path.join(
            globalConfigFolderPath,
            'daemons',
            `${projectName}.global.daemon.desired.json`,
        );
        await expect(fs.access(desiredPath)).resolves.toBeUndefined();
        const result = await makeStopHandler()({ options: { all: true }, arguments: {} });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.messages[0]).toMatch(/Stopped all Lumpcode daemons/);
        await expect(fs.access(pidPath())).rejects.toMatchObject({ code: 'ENOENT' });
        await expect(fs.access(desiredPath)).rejects.toMatchObject({ code: 'ENOENT' });
    });

    describe('daemon stop mid-run', () => {
        const sigtermIgnorantScript = fileURLToPath(
            new URL('../../testing/sigtermIgnorantTreeChild.cjs', import.meta.url),
        );
        const activeFixturePids = new Set<number>();

        afterEach(() => {
            for (const pid of activeFixturePids) {
                try {
                    process.kill(pid, 'SIGKILL');
                } catch {
                    // already gone
                }
            }
            activeFixturePids.clear();
        });

        const metaPath = () => schedulerFiles().metaFilePath;

        async function writeBusyMeta(overrides: Record<string, unknown> = {}) {
            await writeDaemonMetaSticky({
                filePath: metaPath(),
                data: {
                    cronSetup: '*/5 * * * *',
                    workspaceStrategy: 'checkout',
                    busy: true,
                    ...overrides,
                },
            });
        }

        async function writeInFlightMeta(
            inFlightRunCount: number,
            overrides: Record<string, unknown> = {},
        ) {
            await writeDaemonMetaSticky({
                filePath: metaPath(),
                data: {
                    cronSetup: '*/5 * * * *',
                    workspaceStrategy: 'checkout',
                    inFlightRuns: metaInFlightRuns(inFlightRunCount),
                    ...overrides,
                },
            });
        }

        async function writeLegacyCountMeta(
            inFlightLumpCount: number,
            overrides: Record<string, unknown> = {},
        ) {
            await writeDaemonMetaSticky({
                filePath: metaPath(),
                data: {
                    cronSetup: '*/5 * * * *',
                    workspaceStrategy: 'checkout',
                    inFlightLumpCount,
                    ...overrides,
                },
            });
        }

        async function readDaemonPid(): Promise<number> {
            const raw = await fs.readFile(pidPath(), 'utf8');
            const pid = Number.parseInt(raw.trim(), 10);
            if (Number.isNaN(pid)) {
                throw new Error(`invalid pid in ${pidPath()}`);
            }
            return pid;
        }

        function assertProcessAlive(pid: number) {
            expect(() => process.kill(pid, 0)).not.toThrow();
        }

        async function spawnSigtermIgnorantDaemon(): Promise<{ pid: number; childPids: number[] }> {
            const readyFile = path.join(
                await fs.mkdtemp(path.join(os.tmpdir(), 'lump-sigterm-ready-')),
                'ready.json',
            );
            const child = spawn(process.execPath, [sigtermIgnorantScript], {
                detached: true,
                stdio: 'ignore',
                env: {
                    ...process.env,
                    LUMPCODE_TREE_READY_FILE: readyFile,
                },
            });
            child.unref();
            const pid = child.pid;
            if (pid === undefined) {
                throw new Error('spawn did not return a pid');
            }

            const childPids = await pollUntil({
                timeoutMs: 5000,
                intervalMs: 25,
                timeoutError: 'timed out waiting for sigterm-ignorant tree',
                poll: async () => { try { const raw = await fs.readFile(readyFile, 'utf8'); const parsed = JSON.parse(raw) as { pids?: number[] }; return Array.isArray(parsed.pids) && parsed.pids.length >= 2 ? parsed.pids : undefined; } catch { return undefined; } },
            });

            await fs.mkdir(path.dirname(pidPath()), { recursive: true });
            await fs.writeFile(pidPath(), `${pid}\n`, 'utf8');
            await writeJsonFile({
                filePath: metaPath(),
                data: {
                    cronSetup: '*/5 * * * *',
                    workspaceStrategy: 'checkout',
                    inFlightRuns: [],
                    inFlightLumpCount: 0,
                },
                trailingNewline: true,
            });

            for (const fixturePid of childPids) {
                activeFixturePids.add(fixturePid);
            }
            return { pid, childPids };
        }

        it('K1: refuses when inFlightRuns is non-empty (parallel-global-daemon-worktree)', async () => {
            await runStart(aliveDaemonSpawnFn);
            await waitForDaemonPidFile(pidPath());
            const pid = await readDaemonPid();
            await writeInFlightMeta(2);

            const result = await makeStopHandler()({ options: { json: true }, arguments: {} });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.messages.join(' ')).toMatch(/busy|in[- ]?flight|mid-run/i);
            expect(result.data.messages.join(' ')).toMatch(/--force/);
            expect(result.data.data?.code).toBe('daemonBusy');
            assertProcessAlive(pid);
            await expect(fs.access(pidPath())).resolves.toBeUndefined();
            await expect(fs.access(metaPath())).resolves.toBeUndefined();
        });

        it('K2: refuses when legacy busy: true (parallel-global-daemon-worktree)', async () => {
            await runStart(aliveDaemonSpawnFn);
            await waitForDaemonPidFile(pidPath());
            const pid = await readDaemonPid();
            await writeBusyMeta();

            const result = await makeStopHandler()({ options: { json: true }, arguments: {} });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.messages.join(' ')).toMatch(/busy|--force/i);
            expect(result.data.data?.code).toBe('daemonBusy');
            assertProcessAlive(pid);
            await expect(fs.access(pidPath())).resolves.toBeUndefined();
        });

        it('K6: busy true with empty inFlightRuns still refuses (parallel-global-daemon-worktree)', async () => {
            await runStart(aliveDaemonSpawnFn);
            await waitForDaemonPidFile(pidPath());
            await writeInFlightMeta(0, { busy: true });

            const result = await makeStopHandler()({ options: { json: true }, arguments: {} });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.data?.code).toBe('daemonBusy');
        });

        it('K7: legacy inFlightLumpCount 1 with busy false refuses (parallel-global-daemon-worktree)', async () => {
            await runStart(aliveDaemonSpawnFn);
            await waitForDaemonPidFile(pidPath());
            await writeLegacyCountMeta(1, { busy: false });

            const result = await makeStopHandler()({ options: { json: true }, arguments: {} });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.data?.code).toBe('daemonBusy');
        });

        it('refuses graceful stop when meta is missing (daemonMetaCorrupt)', async () => {
            await runStart(aliveDaemonSpawnFn);
            await waitForDaemonPidFile(pidPath());
            const pid = await readDaemonPid();
            await removeDaemonMetaUntilGone(metaPath());

            const result = await makeStopHandler()({ options: { json: true }, arguments: {} });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.data?.code).toBe('daemonMetaCorrupt');
            expect(result.data.data?.reason).toBe('missing');
            expect(result.data.messages.join(' ')).toMatch(/meta|--force/i);
            assertProcessAlive(pid);
            await expect(fs.access(pidPath())).resolves.toBeUndefined();
        });

        it('stop --force succeeds when meta is missing', async () => {
            await runStart(aliveDaemonSpawnFn);
            await waitForDaemonPidFile(pidPath());
            const pid = await readDaemonPid();
            await removeDaemonMetaUntilGone(metaPath());

            const result = await makeStopHandler()({
                options: { force: true },
                arguments: {},
            });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            await expect(fs.access(pidPath())).rejects.toMatchObject({ code: 'ENOENT' });
            try {
                process.kill(pid, 0);
                throw new Error('expected daemon to be dead');
            } catch (e) {
                expect(e).toMatchObject({ code: 'ESRCH' });
            }
        });

        it('stop --force skips the busy check and removes artifacts', async () => {
            await runStart(aliveDaemonSpawnFn);
            await waitForDaemonPidFile(pidPath());
            const pid = await readDaemonPid();
            await writeBusyMeta();

            const result = await makeStopHandler()({
                options: { force: true },
                arguments: {},
            });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            await expect(fs.access(pidPath())).rejects.toMatchObject({ code: 'ENOENT' });
            await expect(fs.access(metaPath())).rejects.toMatchObject({ code: 'ENOENT' });
            try {
                process.kill(pid, 0);
                throw new Error('expected daemon to be dead');
            } catch (e) {
                expect(e).toMatchObject({ code: 'ESRCH' });
            }
        });

        it('stop --force kills a child subprocess', async () => {
            const { pid, childPids } = await spawnSigtermIgnorantDaemon();

            const result = await makeStopHandler()({
                options: { force: true },
                arguments: {},
            });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            await expect(fs.access(pidPath())).rejects.toMatchObject({ code: 'ENOENT' });
            await expect(fs.access(metaPath())).rejects.toMatchObject({ code: 'ENOENT' });

            await pollUntil({
                timeoutMs: 5000,
                intervalMs: 50,
                timeoutError: 'expected fixture tree to be killed',
                poll: () => {
                    for (const fixturePid of [pid, ...childPids]) {
                        try {
                            process.kill(fixturePid, 0);
                            return undefined;
                        } catch (e) {
                            expect(e).toMatchObject({ code: 'ESRCH' });
                        }
                    }
                    return true;
                },
            });
            for (const fixturePid of [pid, ...childPids]) {
                activeFixturePids.delete(fixturePid);
            }
        }, 15_000);

        it('still SIGTERM-stops an idle daemon within 5s', async () => {
            await runStart(aliveDaemonSpawnFn);
            await waitForDaemonPidFile(pidPath());
            await waitForAliveDaemonChildMeta(metaPath());
            const pid = await readDaemonPid();

            const result = await makeStopHandler()({ options: {}, arguments: {} });
            expect(
                result.success,
                result.success ? '' : result.data.messages.join(' '),
            ).toBe(true);
            if (!result.success) throw new Error('unreachable');
            await expect(fs.access(pidPath())).rejects.toMatchObject({ code: 'ENOENT' });
            try {
                process.kill(pid, 0);
                throw new Error('expected daemon to be dead');
            } catch (e) {
                expect(e).toMatchObject({ code: 'ESRCH' });
            }
        });

        it('stop --force succeeds when the daemon is idle', async () => {
            await runStart(aliveDaemonSpawnFn);
            await waitForDaemonPidFile(pidPath());
            await waitForAliveDaemonChildMeta(metaPath());
            const pid = await readDaemonPid();

            const result = await makeStopHandler()({
                options: { force: true },
                arguments: {},
            });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            await expect(fs.access(pidPath())).rejects.toMatchObject({ code: 'ENOENT' });
            try {
                process.kill(pid, 0);
                throw new Error('expected daemon to be dead');
            } catch (e) {
                expect(e).toMatchObject({ code: 'ESRCH' });
            }
        });

        it('default stop still times out against a SIGTERM-ignoring process when not busy', async () => {
            const { pid } = await spawnSigtermIgnorantDaemon();

            const result = await makeStopHandler()({ options: {}, arguments: {} });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.messages.join(' ')).toMatch(/did not exit within/i);
            await expect(fs.access(pidPath())).resolves.toBeUndefined();
            assertProcessAlive(pid);
        }, 15_000);
    });

    describe('kill-spawned-command-on-timeout-abort stop behavior (ST1–ST10)', () => {
        const sigtermIgnorantScript = fileURLToPath(
            new URL('../../testing/sigtermIgnorantTreeChild.cjs', import.meta.url),
        );
        const activeFixturePids = new Set<number>();

        afterEach(() => {
            for (const pid of activeFixturePids) {
                try {
                    process.kill(pid, 'SIGKILL');
                } catch {
                    // already gone
                }
            }
            activeFixturePids.clear();
        });

        const metaPath = () => schedulerFiles().metaFilePath;

        async function writeInFlightMeta(
            inFlightRunCount: number,
            overrides: Record<string, unknown> = {},
        ) {
            await writeDaemonMetaSticky({
                filePath: metaPath(),
                data: {
                    cronSetup: '*/5 * * * *',
                    workspaceStrategy: 'checkout',
                    inFlightRuns: metaInFlightRuns(inFlightRunCount),
                    ...overrides,
                },
            });
        }

        async function writeBusyMeta(overrides: Record<string, unknown> = {}) {
            await writeDaemonMetaSticky({
                filePath: metaPath(),
                data: {
                    cronSetup: '*/5 * * * *',
                    workspaceStrategy: 'checkout',
                    busy: true,
                    ...overrides,
                },
            });
        }

        async function readDaemonPid(): Promise<number> {
            const raw = await fs.readFile(pidPath(), 'utf8');
            const pid = Number.parseInt(raw.trim(), 10);
            if (Number.isNaN(pid)) {
                throw new Error(`invalid pid in ${pidPath()}`);
            }
            return pid;
        }

        function assertProcessAlive(pid: number) {
            expect(() => process.kill(pid, 0)).not.toThrow();
        }

        async function spawnSigtermIgnorantDaemon(): Promise<{ pid: number; childPids: number[] }> {
            const readyFile = path.join(
                await fs.mkdtemp(path.join(os.tmpdir(), 'lump-sigterm-ready-')),
                'ready.json',
            );
            const child = spawn(process.execPath, [sigtermIgnorantScript], {
                detached: true,
                stdio: 'ignore',
                env: {
                    ...process.env,
                    LUMPCODE_TREE_READY_FILE: readyFile,
                },
            });
            child.unref();
            const pid = child.pid;
            if (pid === undefined) {
                throw new Error('spawn did not return a pid');
            }

            const childPids = await pollUntil({
                timeoutMs: 5000,
                intervalMs: 25,
                timeoutError: 'timed out waiting for sigterm-ignorant tree',
                poll: async () => {
                    try {
                        const raw = await fs.readFile(readyFile, 'utf8');
                        const parsed = JSON.parse(raw) as { pids?: number[] };
                        return Array.isArray(parsed.pids) && parsed.pids.length >= 2
                            ? parsed.pids
                            : undefined;
                    } catch {
                        return undefined;
                    }
                },
            });

            await fs.mkdir(path.dirname(pidPath()), { recursive: true });
            await fs.writeFile(pidPath(), `${pid}\n`, 'utf8');
            await writeJsonFile({
                filePath: metaPath(),
                data: {
                    cronSetup: '*/5 * * * *',
                    workspaceStrategy: 'checkout',
                    inFlightRuns: [],
                    inFlightLumpCount: 0,
                },
                trailingNewline: true,
            });

            for (const fixturePid of childPids) {
                activeFixturePids.add(fixturePid);
            }
            return { pid, childPids };
        }

        // ST1–ST4 / ST9: rewritten for mid-run refuse (parallel-global-daemon-worktree K*).
        it('ST1/K1: mid-run default stop refuses with daemonBusy', async () => {
            await runStart(aliveDaemonSpawnFn);
            await waitForDaemonPidFile(pidPath());
            const pid = await readDaemonPid();
            await writeInFlightMeta(2);

            const result = await makeStopHandler()({ options: {}, arguments: {} });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.messages.join(' ')).toMatch(/busy|in[- ]?flight|mid-run/i);
            expect(result.data.messages.join(' ')).toMatch(/--force/);
            assertProcessAlive(pid);
            await expect(fs.access(pidPath())).resolves.toBeUndefined();
            await expect(fs.access(metaPath())).resolves.toBeUndefined();
        });

        it('ST2/K1: mid-run --json includes daemonBusy code', async () => {
            await runStart(aliveDaemonSpawnFn);
            await waitForDaemonPidFile(pidPath());
            await writeInFlightMeta(2);

            const result = await makeStopHandler()({
                options: { json: true },
                arguments: {},
            });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.data?.code).toBe('daemonBusy');
        });

        it('ST3/K1: mid-run stop does not SIGTERM the daemon', async () => {
            await runStart(aliveDaemonSpawnFn);
            await waitForDaemonPidFile(pidPath());
            const pid = await readDaemonPid();
            await writeInFlightMeta(1);

            const killSpy = vi.spyOn(process, 'kill');
            try {
                await makeStopHandler()({ options: {}, arguments: {} });
                const termCalls = killSpy.mock.calls.filter(
                    (call) => call[0] === pid && call[1] === 'SIGTERM',
                );
                expect(termCalls).toHaveLength(0);
            } finally {
                killSpy.mockRestore();
            }
        });

        it('ST4/K1: per-lump mid-run stop refuses with daemonBusy', async () => {
            const lumpProjectName = 'stop-mid-run-lump-project';
            await writeJsonFile({
                filePath: path.join(localConfigFolderPath, 'project.json'),
                data: { projectName: lumpProjectName },
            });

            const lumpFiles = daemonSchedulerFiles({
                daemonsDir: path.join(globalConfigFolderPath, 'daemons'),
                projectName: lumpProjectName,
                daemonId: 'alpha',
            });
            const lumpPidPath = lumpFiles.pidFilePath;
            const lumpMetaPath = lumpFiles.metaFilePath;

            const lumpStart = startCommand.handlerMaker({
                projectRoot,
                localConfigFolderPath,
                globalConfigFolderPath,
                spawnFn: aliveDaemonSpawnFn,
                skipEnsureSupervisor: true,
            });
            const lumpStartResult = await lumpStart({
                options: { lumpName: 'alpha' },
                arguments: {},
            });
            expect(lumpStartResult.success).toBe(true);
            await waitForDaemonPidFile(lumpPidPath);

            const lumpPid = Number.parseInt((await fs.readFile(lumpPidPath, 'utf8')).trim(), 10);
            await writeDaemonMetaSticky({
                filePath: lumpMetaPath,
                data: {
                    cronSetup: '*/5 * * * *',
                    workspaceStrategy: 'checkout',
                    lumpName: 'alpha',
                    inFlightRuns: [{ lumpName: 'alpha' }],
                },
            });

            const result = await makeStopHandler()({
                options: { lumpName: 'alpha', json: true },
                arguments: {},
            });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.data?.code).toBe('daemonBusy');
            assertProcessAlive(lumpPid);
            await expect(fs.access(lumpPidPath)).resolves.toBeUndefined();
        });

        it('ST5/K3: idle stop within 5s still succeeds', async () => {
            await runStart(aliveDaemonSpawnFn);
            await waitForDaemonPidFile(pidPath());
            const pid = await readDaemonPid();
            await writeInFlightMeta(0);

            const result = await makeStopHandler()({ options: {}, arguments: {} });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            await expect(fs.access(pidPath())).rejects.toMatchObject({ code: 'ENOENT' });
            try {
                process.kill(pid, 0);
                throw new Error('expected daemon to be dead');
            } catch (e) {
                expect(e).toMatchObject({ code: 'ESRCH' });
            }
        });

        it('ST6/K4: --force while in flight removes artifacts and kills process', async () => {
            await runStart(aliveDaemonSpawnFn);
            await waitForDaemonPidFile(pidPath());
            const pid = await readDaemonPid();
            await writeInFlightMeta(2);

            const result = await makeStopHandler()({
                options: { force: true },
                arguments: {},
            });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            await expect(fs.access(pidPath())).rejects.toMatchObject({ code: 'ENOENT' });
            await expect(fs.access(metaPath())).rejects.toMatchObject({ code: 'ENOENT' });
            try {
                process.kill(pid, 0);
                throw new Error('expected daemon to be dead');
            } catch (e) {
                expect(e).toMatchObject({ code: 'ESRCH' });
            }
        });

        it('ST7: --force kills child tree', async () => {
            const { pid, childPids } = await spawnSigtermIgnorantDaemon();

            const result = await makeStopHandler()({
                options: { force: true },
                arguments: {},
            });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            await expect(fs.access(pidPath())).rejects.toMatchObject({ code: 'ENOENT' });

            await pollUntil({
                timeoutMs: 5000,
                intervalMs: 50,
                timeoutError: 'expected fixture tree to be killed',
                poll: () => {
                    for (const fixturePid of [pid, ...childPids]) {
                        try {
                            process.kill(fixturePid, 0);
                            return undefined;
                        } catch (e) {
                            expect(e).toMatchObject({ code: 'ESRCH' });
                        }
                    }
                    return true;
                },
            });
            for (const fixturePid of [pid, ...childPids]) {
                activeFixturePids.delete(fixturePid);
            }
        }, 15_000);

        it('ST8: idle SIGTERM-ignore still times out ~5s', async () => {
            const { pid } = await spawnSigtermIgnorantDaemon();

            const result = await makeStopHandler()({ options: {}, arguments: {} });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.messages.join(' ')).toMatch(/did not exit within/i);
            expect(JSON.stringify(result.data)).not.toMatch(/daemonBusy/);
            await expect(fs.access(pidPath())).resolves.toBeUndefined();
            assertProcessAlive(pid);
        }, 15_000);

        it('ST9/K2: legacy busy mid-run refuses (no cooperative wait)', async () => {
            const { pid } = await spawnSigtermIgnorantDaemon();
            await writeBusyMeta();

            const result = await makeStopHandler()({ options: { json: true }, arguments: {} });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.data?.code).toBe('daemonBusy');
            expect(result.data.messages.join(' ')).toMatch(/--force/);
            assertProcessAlive(pid);
            await expect(fs.access(pidPath())).resolves.toBeUndefined();
        });

        it('ST10: --force uses immediate kill (graceMs 0)', async () => {
            const { pid, childPids } = await spawnSigtermIgnorantDaemon();
            const started = Date.now();

            const result = await makeStopHandler()({
                options: { force: true },
                arguments: {},
            });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(Date.now() - started).toBeLessThan(5000);

            await pollUntil({
                timeoutMs: 5000,
                intervalMs: 50,
                timeoutError: 'expected force kill to reap tree quickly',
                poll: () => {
                    for (const fixturePid of [pid, ...childPids]) {
                        try {
                            process.kill(fixturePid, 0);
                            return undefined;
                        } catch (e) {
                            expect(e).toMatchObject({ code: 'ESRCH' });
                        }
                    }
                    return true;
                },
            });
            for (const fixturePid of [pid, ...childPids]) {
                activeFixturePids.delete(fixturePid);
            }
        }, 15_000);
    });

    describe('stop --all slow SIGTERM exit', () => {
        const activePids = new Set<number>();

        afterEach(() => {
            for (const pid of activePids) {
                try {
                    process.kill(pid, 'SIGKILL');
                } catch {
                    // already gone
                }
            }
            activePids.clear();
        });

        function captureLogger(): { logger: Logger; infos: string[] } {
            const infos: string[] = [];
            const logger: Logger = {
                error() {},
                warn() {},
                info(message: string) {
                    infos.push(message);
                },
                verbose() {},
                child() {
                    return logger;
                },
            };
            return { logger, infos };
        }

        async function spawnHold(input: {
            mode: 'ignore' | 'delay' | 'default';
            delayMs?: number;
        }): Promise<number> {
            const readyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-hold-'));
            const readyFile = path.join(readyDir, 'ready');
            const child = spawn(
                process.execPath,
                [
                    '-e',
                    `const fs = require('node:fs');
const mode = process.env.LUMP_HOLD_MODE;
const delay = Number(process.env.LUMP_HOLD_DELAY_MS || 0);
if (mode === 'ignore' || mode === 'delay') {
  process.on('SIGTERM', () => {
    if (mode === 'ignore') return;
    setTimeout(() => process.exit(0), delay);
  });
}
fs.writeFileSync(process.env.LUMP_HOLD_READY, '1');
setInterval(() => {}, 60000);`,
                ],
                {
                    detached: true,
                    stdio: 'ignore',
                    env: {
                        ...process.env,
                        LUMP_HOLD_MODE: input.mode,
                        LUMP_HOLD_DELAY_MS: String(input.delayMs ?? 0),
                        LUMP_HOLD_READY: readyFile,
                    },
                },
            );
            child.unref();
            const pid = child.pid;
            if (pid === undefined) {
                throw new Error('spawn did not return a pid');
            }
            activePids.add(pid);
            await pollUntil({
                timeoutMs: 5000,
                intervalMs: 25,
                timeoutError: 'hold fixture did not become ready',
                poll: async () => {
                    try {
                        await fs.access(readyFile);
                        return true;
                    } catch {
                        return undefined;
                    }
                },
            });
            return pid;
        }

        async function plantIdleDaemon(daemonId: string, pid: number) {
            const files = daemonSchedulerFiles({
                daemonsDir: path.join(globalConfigFolderPath, 'daemons'),
                projectName,
                daemonId,
            });
            await fs.mkdir(path.dirname(files.pidFilePath), { recursive: true });
            await fs.writeFile(files.pidFilePath, `${pid}\n`, 'utf8');
            await fs.writeFile(files.logFilePath, 'log\n', 'utf8');
            await writeJsonFile({
                filePath: files.metaFilePath,
                data: {
                    daemonId,
                    cronSetup: '*/5 * * * *',
                    workspaceStrategy: 'checkout',
                    inFlightRuns: [],
                },
            });
            await writeJsonFile({
                filePath: files.desiredFilePath,
                data: { projectRoot, daemonId, cronSetup: '*/5 * * * *' },
            });
            return files;
        }

        function assertDead(pid: number) {
            expect(() => process.kill(pid, 0)).toThrow();
            activePids.delete(pid);
        }

        it('waits out a daemon that exits ~7s after SIGTERM and still stops the rest', async () => {
            const slowPid = await spawnHold({ mode: 'delay', delayMs: 7000 });
            const fastPid = await spawnHold({ mode: 'default' });
            const supervisorPid = await spawnHold({ mode: 'default' });
            const slowFiles = await plantIdleDaemon('slow', slowPid);
            const fastFiles = await plantIdleDaemon('fast', fastPid);
            const supervisorPidFile = supervisorPidPath({ globalConfigFolderPath, projectName });
            const supervisorMetaFile = supervisorMetaPath({ globalConfigFolderPath, projectName });
            await fs.mkdir(path.dirname(supervisorPidFile), { recursive: true });
            await fs.writeFile(supervisorPidFile, `${supervisorPid}\n`, 'utf8');
            await writeJsonFile({
                filePath: supervisorMetaFile,
                data: { projectRoot, startedAt: new Date().toISOString() },
            });

            const logs: string[] = [];
            const spy = vi.spyOn(console, 'log').mockImplementation((message?: unknown) => {
                logs.push(String(message));
            });
            try {
                const result = await makeStopHandler()({ options: { all: true }, arguments: {} });
                expect(
                    result.success,
                    result.success ? '' : result.data.messages.join(' '),
                ).toBe(true);
                if (!result.success) throw new Error('unreachable');
                const text = result.data.messages.join(' ');
                expect(text).toMatch(/Stopped all Lumpcode daemons and the supervisor/);
                expect(text).not.toMatch(/Process pid \d+ did not exit within/);
                expect(logs.join('\n')).toContain(
                    'daemon "slow" did not exit within 5s after SIGTERM; waiting for drain',
                );
                expect(logs.join('\n')).not.toMatch(/Process pid \d+ did not exit within/);
            } finally {
                spy.mockRestore();
            }

            for (const files of [slowFiles, fastFiles]) {
                await expect(fs.access(files.pidFilePath)).rejects.toMatchObject({ code: 'ENOENT' });
                await expect(fs.access(files.metaFilePath)).rejects.toMatchObject({ code: 'ENOENT' });
                await expect(fs.access(files.desiredFilePath)).rejects.toMatchObject({ code: 'ENOENT' });
                await expect(fs.access(files.logFilePath)).rejects.toMatchObject({ code: 'ENOENT' });
            }
            await expect(fs.access(supervisorPidFile)).rejects.toMatchObject({ code: 'ENOENT' });
            await expect(fs.access(supervisorMetaFile)).rejects.toMatchObject({ code: 'ENOENT' });
            assertDead(slowPid);
            assertDead(fastPid);
            assertDead(supervisorPid);
        }, 20_000);

        it('names daemons still running when the shared drain wait times out', async () => {
            const nightlyPid = await spawnHold({ mode: 'ignore' });
            const globalPid = await spawnHold({ mode: 'default' });
            await plantIdleDaemon('nightly', nightlyPid);
            await plantIdleDaemon('global', globalPid);
            const { logger, infos } = captureLogger();

            const result = await stopAllProjectDaemons({
                projectName,
                daemonsDir: path.join(globalConfigFolderPath, 'daemons'),
                globalConfigFolderPath,
                force: false,
                logger,
                drainTimeoutMs: 600,
            });

            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data).toBe(
                'Timed out waiting for project daemons to exit (still running: "nightly"). Run `lumpcode stop --all --force`.',
            );
            expect(infos).toContain(
                'daemon "nightly" did not exit within 5s after SIGTERM; waiting for drain',
            );
            assertDead(globalPid);
            expect(() => process.kill(nightlyPid, 0)).not.toThrow();
        }, 20_000);
    });
});
