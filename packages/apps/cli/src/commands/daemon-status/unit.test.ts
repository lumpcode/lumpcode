import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
    removeDaemonMetaUntilGone,
    setDaemonTestGlobalConfigFolder,
    withAliveDaemon,
    writeDaemonMetaSticky,
} from '../../testing';
import { command as daemonStatusCommand } from './main';
import { initLocalGitRepo, writeJsonFile, writeLumpConfigJson, createTempTestDirs, removeTempTestDirs } from '../../utils';

describe('daemon-status command', () => {
    let projectRoot: string;
    let globalConfigFolderPath: string;
    let localConfigFolderPath: string;
    const projectName = 'status-test-project';

    beforeEach(async () => {
        ({ projectRoot, globalConfigFolderPath, localConfigFolderPath } = await createTempTestDirs({ prefix: 'lump-status-', remote: false }));
        setDaemonTestGlobalConfigFolder(globalConfigFolderPath);
        initLocalGitRepo({ cwd: projectRoot });
        await writeLumpConfigJson({ localConfigFolderPath, lumpName: 'alpha' });
        await writeJsonFile({ filePath: path.join(localConfigFolderPath, 'project.json'), data: { projectName } });
        await fs.writeFile(path.join(projectRoot, 'README.md'), '# test\n', 'utf-8');
        await writeJsonFile({ filePath: path.join(localConfigFolderPath, 'local.json'), data: { mode: 'dedicated', primaryBranch: 'main' } });
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

    describe('inFlightLumpCount surface (parallel-global-daemon-worktree D*)', () => {
        it('D1: JSON status includes inFlightLumpCount when running', async () => {
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
                    expect((statusResult.data.data as { running: boolean }).running).toBe(true);
                    expect(
                        (statusResult.data.data as { inFlightLumpCount?: number }).inFlightLumpCount,
                    ).toBe(2);
                    expect(statusResult.data.messages.join('\n')).toMatch(/in[- ]?flight|2/i);
                },
            });
        });

        it('D2: idle running daemon surfaces inFlightLumpCount 0', async () => {
            await withAliveDaemon({
                ...aliveDaemonDeps(),
                forceStop: true,
                run: async ({ metaFilePath }) => {
                    await writeDaemonMetaSticky({
                        filePath: metaFilePath,
                        data: {
                            cronSetup: '15 * * * *',
                            workspaceStrategy: 'checkout',
                            inFlightLumpCount: 0,
                        },
                    });

                    const statusResult = await makeDaemonStatusHandler()({
                        options: { json: true, daemonId: 'global' },
                        arguments: {},
                    });
                    expect(statusResult.success).toBe(true);
                    if (!statusResult.success) throw new Error('unreachable');
                    expect((statusResult.data.data as { running: boolean }).running).toBe(true);
                    expect(
                        (statusResult.data.data as { inFlightLumpCount?: number }).inFlightLumpCount,
                    ).toBe(0);
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
    });
});
