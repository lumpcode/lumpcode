import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
    aliveDaemonSpawnFn,
    setDaemonTestGlobalConfigFolder,
    waitForDaemonPidFile,
} from '../../testing';
import { command as startCommand } from '../start/main';
import { command as stopCommand } from '../stop/main';
import { command as daemonStatusCommand } from './main';
import { execGit } from '../../utils/execGit';
import { writeJsonFile } from '../../utils/writeJsonFile';


const minimalLumpConfigJson = `{
  "baseBranch": "main",
  "contextListJson": {
    "FILE": "src/{NAME}.ts"
  },
  "prompt": {
    "promptTemplate": "Improve the code at @{FILE}.",
    "command": "claude"
  }
}
`;

describe('daemon-status command', () => {
    let projectRoot: string;
    let globalConfigFolderPath: string;
    let localConfigFolderPath: string;
    const projectName = 'status-test-project';

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-status-'));
        globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-status-global-'));
        setDaemonTestGlobalConfigFolder(globalConfigFolderPath);
        localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        execGit('init -b main', projectRoot);
        execGit('config user.email "test@test.com"', projectRoot);
        execGit('config user.name "Test"', projectRoot);
        execGit('commit --allow-empty -m "init"', projectRoot);
        await fs.mkdir(path.join(localConfigFolderPath, 'lumps', 'alpha'), { recursive: true });
        await writeJsonFile({ filePath: path.join(localConfigFolderPath, 'project.json'), data: { projectName } });
        await fs.writeFile(
            path.join(localConfigFolderPath, 'lumps', 'alpha', 'config.json'),
            minimalLumpConfigJson,
            'utf-8',
        );
        await fs.writeFile(path.join(projectRoot, 'README.md'), '# test\n', 'utf-8');
        await writeJsonFile({ filePath: path.join(localConfigFolderPath, 'local.json'), data: { mode: 'dedicated', primaryBranch: 'main' } });
    });

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
        await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
    });

    function makeDaemonStatusHandler() {
        return daemonStatusCommand.handlerMaker({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
        });
    }

    it('fails when not a Lumpcode project root', async () => {
        const badRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-status-bad-'));
        const badGlobal = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-status-bad-global-'));
        try {
            await fs.mkdir(path.join(badRoot, '.lumpcode'), { recursive: true });
            const handle = daemonStatusCommand.handlerMaker({
                projectRoot: badRoot,
                localConfigFolderPath: path.join(badRoot, '.lumpcode'),
                globalConfigFolderPath: badGlobal,
            });
            const result = await handle({ options: {}, arguments: {} });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.messages[0]).toContain('Not a Lumpcode project root');
        } finally {
            await fs.rm(badRoot, { recursive: true, force: true });
            await fs.rm(badGlobal, { recursive: true, force: true });
        }
    });

    it('lists no daemons when there is no PID file', async () => {
        const result = await makeDaemonStatusHandler()({ options: {}, arguments: {} });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        const data = result.data.data as { daemons: unknown[] };
        expect(data.daemons).toEqual([]);
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
        const startHandle = startCommand.handlerMaker({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            spawnFn: aliveDaemonSpawnFn,
        });
        const startResult = await startHandle({
            options: { cronSetup: '15 * * * *' },
            arguments: {},
        });
        expect(startResult.success).toBe(true);
        await waitForDaemonPidFile(
            path.join(globalConfigFolderPath, 'daemons', `${projectName}.global.daemon.pid`),
        );

        try {
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
        } finally {
            const stopHandle = stopCommand.handlerMaker({
                projectRoot,
                localConfigFolderPath,
                globalConfigFolderPath,
            });
            await stopHandle({ options: {}, arguments: {} });
        }
    });

    describe('inFlightLumpCount surface (parallel-global-daemon-worktree D*)', () => {
        it('D1: JSON status includes inFlightLumpCount when running', async () => {
            const startHandle = startCommand.handlerMaker({
                projectRoot,
                localConfigFolderPath,
                globalConfigFolderPath,
                spawnFn: aliveDaemonSpawnFn,
            });
            const startResult = await startHandle({
                options: { cronSetup: '15 * * * *' },
                arguments: {},
            });
            expect(startResult.success).toBe(true);
            const pidPath = path.join(globalConfigFolderPath, 'daemons', `${projectName}.global.daemon.pid`);
            const metaPath = path.join(globalConfigFolderPath, 'daemons', `${projectName}.global.daemon.meta.json`);
            await waitForDaemonPidFile(pidPath);

            await writeJsonFile({
                filePath: metaPath,
                data: {
                    cronSetup: '15 * * * *',
                    workspaceStrategy: 'checkout',
                    inFlightLumpCount: 2,
                },
                trailingNewline: true,
            });

            try {
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
            } finally {
                const stopHandle = stopCommand.handlerMaker({
                    projectRoot,
                    localConfigFolderPath,
                    globalConfigFolderPath,
                });
                await stopHandle({ options: { force: true }, arguments: {} });
            }
        });

        it('D2: idle running daemon surfaces inFlightLumpCount 0', async () => {
            const startHandle = startCommand.handlerMaker({
                projectRoot,
                localConfigFolderPath,
                globalConfigFolderPath,
                spawnFn: aliveDaemonSpawnFn,
            });
            const startResult = await startHandle({
                options: { cronSetup: '15 * * * *' },
                arguments: {},
            });
            expect(startResult.success).toBe(true);
            const pidPath = path.join(globalConfigFolderPath, 'daemons', `${projectName}.global.daemon.pid`);
            const metaPath = path.join(globalConfigFolderPath, 'daemons', `${projectName}.global.daemon.meta.json`);
            await waitForDaemonPidFile(pidPath);

            await writeJsonFile({
                filePath: metaPath,
                data: {
                    cronSetup: '15 * * * *',
                    workspaceStrategy: 'checkout',
                    inFlightLumpCount: 0,
                },
                trailingNewline: true,
            });

            try {
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
            } finally {
                const stopHandle = stopCommand.handlerMaker({
                    projectRoot,
                    localConfigFolderPath,
                    globalConfigFolderPath,
                });
                await stopHandle({ options: { force: true }, arguments: {} });
            }
        });

        it('reports metaStatus when PID is alive but meta is missing', async () => {
            const startHandle = startCommand.handlerMaker({
                projectRoot,
                localConfigFolderPath,
                globalConfigFolderPath,
                spawnFn: aliveDaemonSpawnFn,
            });
            const startResult = await startHandle({
                options: { cronSetup: '15 * * * *' },
                arguments: {},
            });
            expect(startResult.success).toBe(true);
            const pidPath = path.join(globalConfigFolderPath, 'daemons', `${projectName}.global.daemon.pid`);
            const metaPath = path.join(globalConfigFolderPath, 'daemons', `${projectName}.global.daemon.meta.json`);
            await waitForDaemonPidFile(pidPath);
            await fs.unlink(metaPath);

            try {
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
            } finally {
                const stopHandle = stopCommand.handlerMaker({
                    projectRoot,
                    localConfigFolderPath,
                    globalConfigFolderPath,
                });
                await stopHandle({ options: { force: true }, arguments: {} });
            }
        });
    });
});
