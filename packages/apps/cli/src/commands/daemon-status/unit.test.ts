import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
    createDaemonCommandTestProject,
    removeDaemonMetaUntilGone,
    withAliveDaemon,
    writeDaemonMetaSticky,
    writeLocalJson,
} from '../../testing';
import { command as daemonStatusCommand } from './main';
import {
    createTempTestDirs,
    fingerprintResolvedLocalConfig,
    readProjectLocalConfig,
    removeTempTestDirs,
    writeJsonFile,
    type DaemonInFlightRun,
} from '../../utils';

describe('daemon-status command', () => {
    let projectRoot: string;
    let globalConfigFolderPath: string;
    let localConfigFolderPath: string;
    const projectName = 'status-test-project';

    beforeEach(async () => {
        ({ projectRoot, globalConfigFolderPath, localConfigFolderPath } = await createDaemonCommandTestProject({ prefix: 'lump-status-', projectName }));
    });

    afterEach(async () => {
        await removeTempTestDirs({ projectRoot, globalConfigFolderPath });
    });

    function makeDaemonStatusHandler() {
        return daemonStatusCommand.handlerMaker({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
        });
    }

    const aliveDaemonDeps = () => ({
        projectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
        cronSetup: '15 * * * *',
    });

    it('fails when not a Lumpcode project root', async () => {
        const dirs = await createTempTestDirs({ prefix: 'lump-status-bad-', remote: false });
        try {
            const handle = daemonStatusCommand.handlerMaker({
                projectRoot: dirs.projectRoot,
                localConfigFolderPath: dirs.localConfigFolderPath,
                globalConfigFolderPath: dirs.globalConfigFolderPath,
            });
            const result = await handle({ options: {}, arguments: {} });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.messages[0]).toContain('Not a Lumpcode project root');
        } finally {
            await removeTempTestDirs(dirs);
        }
    });

    it('lists no daemons when there is no PID file', async () => {
        const result = await makeDaemonStatusHandler()({ options: {}, arguments: {} });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        const data = result.data.data as { daemons: unknown[] };
        expect(data.daemons).toEqual([]);
        expect((result.data.data as { supervisor: { running: boolean } }).supervisor.running).toBe(false);
        expect(result.data.messages[0]).toMatch(/No Lumpcode background daemons/i);
    });

    it('reports stale PID when inspecting --daemonId global', async () => {
        const daemonsDir = path.join(globalConfigFolderPath, 'daemons');
        await fs.mkdir(daemonsDir, { recursive: true });
        const pidPath = path.join(daemonsDir, `${projectName}.global.daemon.pid`);
        const metaPath = path.join(daemonsDir, `${projectName}.global.daemon.meta.json`);
        await fs.writeFile(pidPath, '999999999\n', 'utf8');
        await writeJsonFile({ filePath: metaPath, data: { cronSetup: '0 * * * *' }, trailingNewline: true });

        const result = await makeDaemonStatusHandler()({
            options: { daemonId: 'global' },
            arguments: {},
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect((result.data.data as { running: boolean }).running).toBe(false);
        expect((result.data.data as { stalePidFile?: boolean }).stalePidFile).toBe(true);
        expect((result.data.data as { cronSetup?: string }).cronSetup).toBe('0 * * * *');
        expect(result.data.messages.join('\n')).toMatch(/stale|not running/i);
    });

    it('lists running daemons after a detached start', async () => {
        await withAliveDaemon({
            ...aliveDaemonDeps(),
            run: async () => {
                const listResult = await makeDaemonStatusHandler()({ options: { json: true }, arguments: {} });
                expect(listResult.success).toBe(true);
                if (!listResult.success) throw new Error('unreachable');
                const listData = listResult.data.data as {
                    daemons: Array<{ daemonId: string; running: boolean; cronSetup?: string; pid?: number }>;
                };
                expect(listData.daemons).toHaveLength(1);
                expect(listData.daemons[0]!.daemonId).toBe('global');
                expect(listData.daemons[0]!.running).toBe(true);

                const statusResult = await makeDaemonStatusHandler()({
                    options: { json: true, daemonId: 'global' },
                    arguments: {},
                });
                expect(statusResult.success).toBe(true);
                if (!statusResult.success) throw new Error('unreachable');
                expect((statusResult.data.data as { running: boolean }).running).toBe(true);
                expect((statusResult.data.data as { cronSetup?: string }).cronSetup).toBe('15 * * * *');
                expect(typeof (statusResult.data.data as { pid?: number }).pid).toBe('number');
            },
        });
    });

    it('reports metaStatus when PID is alive but meta is missing', async () => {
        await withAliveDaemon({
            ...aliveDaemonDeps(),
            forceStop: true,
            run: async ({ metaFilePath }) => {
                await removeDaemonMetaUntilGone(metaFilePath);

                const statusResult = await makeDaemonStatusHandler()({
                    options: { json: true, daemonId: 'global' },
                    arguments: {},
                });
                expect(statusResult.success).toBe(true);
                if (!statusResult.success) throw new Error('unreachable');
                const data = statusResult.data.data as {
                    running: boolean;
                    metaStatus?: string;
                    inFlightLumpCount?: number;
                    workspaceStrategy?: string;
                };
                expect(data.running).toBe(true);
                expect(data.metaStatus).toBe('missing');
                expect(data.inFlightLumpCount).toBeUndefined();
                expect(data.workspaceStrategy).toBeUndefined();
                expect(statusResult.data.messages.join('\n')).toMatch(/meta|--force/i);
            },
        });
    });

    describe('inFlightLumpCount omitted from daemon-status (daemon-snapshot-meta-deprecation)', () => {
        it('JSON single-daemon and list-all omit inFlightLumpCount; no count-only human line', async () => {
            await withAliveDaemon({
                ...aliveDaemonDeps(),
                forceStop: true,
                run: async ({ metaFilePath }) => {
                    await writeDaemonMetaSticky({
                        filePath: metaFilePath,
                        data: {
                            cronSetup: '15 * * * *',
                            workspaceStrategy: 'checkout',
                            inFlightRuns: [
                                { lumpName: 'backlog', contextName: 'ctx-a' },
                                { lumpName: 'qol' },
                            ],
                        },
                    });

                    const statusResult = await makeDaemonStatusHandler()({
                        options: { json: true, daemonId: 'global' },
                        arguments: {},
                    });
                    expect(statusResult.success).toBe(true);
                    if (!statusResult.success) throw new Error('unreachable');
                    const data = statusResult.data.data as Record<string, unknown>;
                    expect(data.running).toBe(true);
                    expect(Object.hasOwn(data, 'inFlightLumpCount')).toBe(false);
                    expect(data.inFlightRuns).toEqual([
                        { lumpName: 'backlog', contextName: 'ctx-a' },
                        { lumpName: 'qol' },
                    ]);
                    expect(statusResult.data.messages.join('\n')).not.toMatch(
                        /In-flight lump runs:\s*\d/,
                    );

                    const listed = await makeDaemonStatusHandler()({
                        options: { json: true },
                        arguments: {},
                    });
                    expect(listed.success).toBe(true);
                    if (!listed.success) throw new Error('unreachable');
                    const listedDaemon = (
                        listed.data.data as { daemons: Array<Record<string, unknown>> }
                    ).daemons[0]!;
                    expect(Object.hasOwn(listedDaemon, 'inFlightLumpCount')).toBe(false);
                },
            });
        });

        it('JSON omits inFlightLumpCount for legacy count-only meta', async () => {
            await withAliveDaemon({
                ...aliveDaemonDeps(),
                forceStop: true,
                run: async ({ metaFilePath }) => {
                    await writeDaemonMetaSticky({
                        filePath: metaFilePath,
                        data: {
                            cronSetup: '15 * * * *',
                            workspaceStrategy: 'checkout',
                            inFlightLumpCount: 2,
                        },
                    });
                    const statusResult = await makeDaemonStatusHandler()({
                        options: { json: true, daemonId: 'global' },
                        arguments: {},
                    });
                    expect(statusResult.success).toBe(true);
                    if (!statusResult.success) throw new Error('unreachable');
                    const data = statusResult.data.data as Record<string, unknown>;
                    expect(Object.hasOwn(data, 'inFlightLumpCount')).toBe(false);
                    expect(data.snapshotIncomplete).toBe(true);
                    expect(data.inFlightRuns).toEqual([]);
                },
            });
        });
    });

    describe('snapshot contract (daemon-status-read-snapshot)', () => {
        type SnapshotStatus = {
            running: boolean;
            inFlightRuns?: DaemonInFlightRun[];
            nextTickAt?: string;
            tickPhase?: 'idle' | 'running';
            localConfigStale?: boolean;
            snapshotIncomplete?: boolean;
        };

        const inFlightRuns: DaemonInFlightRun[] = [
            { lumpName: 'backlog', effectiveDiscoveryBranch: 'dev', contextName: 'ctx-a' },
            { lumpName: 'qol' },
        ];

        async function statusJson(daemonId?: string) {
            const result = await makeDaemonStatusHandler()({
                options: { json: true, ...(daemonId !== undefined ? { daemonId } : {}) },
                arguments: {},
            });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            return result;
        }

        it('new-writer JSON keeps inFlightRuns and list-all fields', async () => {
            await withAliveDaemon({
                ...aliveDaemonDeps(),
                forceStop: true,
                run: async ({ metaFilePath }) => {
                    const resolved = await readProjectLocalConfig({ localConfigFolderPath });
                    expect(resolved.success).toBe(true);
                    if (!resolved.success) throw new Error('unreachable');
                    await writeDaemonMetaSticky({
                        filePath: metaFilePath,
                        data: {
                            cronSetup: '15 * * * *',
                            workspaceStrategy: 'checkout',
                            inFlightRuns,
                            nextTickAt: '2026-10-10T21:00:00.000Z',
                            tickPhase: 'running',
                            localConfigFingerprint: fingerprintResolvedLocalConfig(resolved.data),
                        },
                    });

                    const statusResult = await statusJson('global');
                    const data = statusResult.data.data as SnapshotStatus;
                    expect(data.running).toBe(true);
                    expect(Object.hasOwn(data, 'inFlightRuns')).toBe(true);
                    expect(data.inFlightRuns).toEqual(inFlightRuns);
                    expect(data.nextTickAt).toBe('2026-10-10T21:00:00.000Z');
                    expect(data.tickPhase).toBe('running');
                    expect(data.snapshotIncomplete).toBeUndefined();
                    expect(data.localConfigStale).not.toBe(true);
                    const human = statusResult.data.messages.join('\n');
                    expect(human).toMatch(/backlog[\s\S]*ctx-a|ctx-a[\s\S]*backlog/i);
                    expect(human).toMatch(/qol/);
                    expect(human).toMatch(/no context/i);

                    const listed = (await statusJson()).data.data as { daemons: SnapshotStatus[] };
                    expect(listed.daemons[0]!.inFlightRuns).toEqual(inFlightRuns);
                    expect(listed.daemons[0]!.tickPhase).toBe('running');
                },
            });
        });

        it('legacy count-only meta yields empty inFlightRuns and snapshotIncomplete', async () => {
            await withAliveDaemon({
                ...aliveDaemonDeps(),
                forceStop: true,
                run: async ({ metaFilePath }) => {
                    await writeDaemonMetaSticky({
                        filePath: metaFilePath,
                        data: {
                            cronSetup: '15 * * * *',
                            workspaceStrategy: 'checkout',
                            inFlightLumpCount: 2,
                        },
                    });
                    const statusResult = await statusJson('global');
                    const data = statusResult.data.data as SnapshotStatus;
                    expect(data.inFlightRuns).toEqual([]);
                    expect(data.snapshotIncomplete).toBe(true);
                    expect(statusResult.data.messages.join('\n')).toMatch(/without detail|upgrade/i);
                },
            });
        });

        it('omits invented nextTickAt and localConfigStale unless fingerprint differs', async () => {
            await withAliveDaemon({
                ...aliveDaemonDeps(),
                forceStop: true,
                run: async ({ metaFilePath }) => {
                    await writeDaemonMetaSticky({
                        filePath: metaFilePath,
                        data: {
                            cronSetup: '15 * * * *',
                            workspaceStrategy: 'checkout',
                            inFlightRuns: [],
                            inFlightLumpCount: 0,
                            tickPhase: 'idle',
                        },
                    });
                    let data = (await statusJson('global')).data.data as SnapshotStatus;
                    expect(data.inFlightRuns).toEqual([]);
                    expect(data.nextTickAt).toBeUndefined();
                    expect(data.snapshotIncomplete).toBeUndefined();
                    expect(data.localConfigStale).toBeUndefined();

                    const resolved = await readProjectLocalConfig({ localConfigFolderPath });
                    expect(resolved.success).toBe(true);
                    if (!resolved.success) throw new Error('unreachable');
                    await writeDaemonMetaSticky({
                        filePath: metaFilePath,
                        data: {
                            cronSetup: '15 * * * *',
                            workspaceStrategy: 'checkout',
                            inFlightRuns: [],
                            localConfigFingerprint: fingerprintResolvedLocalConfig(resolved.data),
                        },
                    });
                    await writeLocalJson(localConfigFolderPath, {
                        mode: 'dedicated',
                        primaryBranch: 'main',
                        maxParallelRun: 3,
                    });
                    const staleResult = await statusJson('global');
                    expect((staleResult.data.data as SnapshotStatus).localConfigStale).toBe(true);
                    expect(staleResult.data.messages.join('\n')).toMatch(/restart/i);

                    await fs.unlink(path.join(localConfigFolderPath, 'local.json'));
                    data = (await statusJson('global')).data.data as SnapshotStatus;
                    expect(data.localConfigStale).toBeUndefined();
                },
            });
        });

        it('omits snapshot fields when not running', async () => {
            const daemonsDir = path.join(globalConfigFolderPath, 'daemons');
            await fs.mkdir(daemonsDir, { recursive: true });
            await fs.writeFile(path.join(daemonsDir, `${projectName}.global.daemon.pid`), '999999999\n');
            await writeJsonFile({
                filePath: path.join(daemonsDir, `${projectName}.global.daemon.meta.json`),
                data: { cronSetup: '0 * * * *', inFlightRuns, tickPhase: 'running' },
                trailingNewline: true,
            });
            const stopped = (await statusJson('global')).data.data as SnapshotStatus;
            expect(stopped.running).toBe(false);
            expect(stopped.inFlightRuns).toBeUndefined();
            expect(stopped.snapshotIncomplete).toBeUndefined();
            expect(stopped.localConfigStale).toBeUndefined();
            expect(Object.hasOwn(stopped, 'inFlightLumpCount')).toBe(false);
        });
    });
});
