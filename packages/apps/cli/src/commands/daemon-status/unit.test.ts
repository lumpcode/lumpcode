import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
    aliveDaemonSpawnFn,
    setDaemonTestGlobalConfigFolder,
    waitForDaemonPidFile,
} from '../../testing';
import { command as startCommand } from '../start/main';
import { command as stopCommand } from '../stop/main';
import { command as daemonStatusCommand } from './main';
import { execGit } from '../../utils/execGit';


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
        await fs.writeFile(
            path.join(localConfigFolderPath, 'project.json'),
            JSON.stringify({ projectName }),
            'utf-8',
        );
        await fs.writeFile(
            path.join(localConfigFolderPath, 'lumps', 'alpha', 'config.json'),
            minimalLumpConfigJson,
            'utf-8',
        );
        await fs.writeFile(path.join(projectRoot, 'README.md'), '# test\n', 'utf-8');
        await fs.writeFile(
            path.join(localConfigFolderPath, 'local.json'),
            JSON.stringify({ mode: 'dedicated', primaryBranch: 'main' }),
            'utf-8',
        );
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

    it('reports not running when there is no PID file', async () => {
        const result = await makeDaemonStatusHandler()({ options: {}, arguments: {} });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.data!.running).toBe(false);
        expect(result.data.messages[0]).toContain('not running');
    });

    it('reports stale PID when the PID file references a dead process', async () => {
        const daemonsDir = path.join(globalConfigFolderPath, 'daemons');
        await fs.mkdir(daemonsDir, { recursive: true });
        const pidPath = path.join(daemonsDir, `${projectName}.daemon.pid`);
        const metaPath = path.join(daemonsDir, `${projectName}.daemon.meta.json`);
        await fs.writeFile(pidPath, '999999999\n', 'utf8');
        await fs.writeFile(metaPath, `${JSON.stringify({ cronSetup: '0 * * * *' })}\n`, 'utf8');

        const result = await makeDaemonStatusHandler()({ options: {}, arguments: {} });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.data!.running).toBe(false);
        expect(result.data.data!.stalePidFile).toBe(true);
        expect(result.data.data!.cronSetup).toBe('0 * * * *');
        expect(result.data.messages.join('\n')).toMatch(/stale|not running/i);
    });

    it('reports running with schedule after a detached start', async () => {
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
            path.join(globalConfigFolderPath, 'daemons', `${projectName}.daemon.pid`),
        );

        try {
            const statusResult = await makeDaemonStatusHandler()({ options: { json: true }, arguments: {} });
            expect(statusResult.success).toBe(true);
            if (!statusResult.success) throw new Error('unreachable');
            expect(statusResult.data.data!.running).toBe(true);
            expect(statusResult.data.data!.cronSetup).toBe('15 * * * *');
            expect(typeof statusResult.data.data!.pid).toBe('number');
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
            const pidPath = path.join(globalConfigFolderPath, 'daemons', `${projectName}.daemon.pid`);
            const metaPath = path.join(globalConfigFolderPath, 'daemons', `${projectName}.daemon.meta.json`);
            await waitForDaemonPidFile(pidPath);

            await fs.writeFile(
                metaPath,
                `${JSON.stringify({
                    cronSetup: '15 * * * *',
                    workspaceStrategy: 'checkout',
                    inFlightLumpCount: 2,
                })}\n`,
                'utf8',
            );

            try {
                const statusResult = await makeDaemonStatusHandler()({
                    options: { json: true },
                    arguments: {},
                });
                expect(statusResult.success).toBe(true);
                if (!statusResult.success) throw new Error('unreachable');
                expect(statusResult.data.data!.running).toBe(true);
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
            const pidPath = path.join(globalConfigFolderPath, 'daemons', `${projectName}.daemon.pid`);
            const metaPath = path.join(globalConfigFolderPath, 'daemons', `${projectName}.daemon.meta.json`);
            await waitForDaemonPidFile(pidPath);

            await fs.writeFile(
                metaPath,
                `${JSON.stringify({
                    cronSetup: '15 * * * *',
                    workspaceStrategy: 'checkout',
                    inFlightLumpCount: 0,
                })}\n`,
                'utf8',
            );

            try {
                const statusResult = await makeDaemonStatusHandler()({
                    options: { json: true },
                    arguments: {},
                });
                expect(statusResult.success).toBe(true);
                if (!statusResult.success) throw new Error('unreachable');
                expect(statusResult.data.data!.running).toBe(true);
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
            const pidPath = path.join(globalConfigFolderPath, 'daemons', `${projectName}.daemon.pid`);
            const metaPath = path.join(globalConfigFolderPath, 'daemons', `${projectName}.daemon.meta.json`);
            await waitForDaemonPidFile(pidPath);
            await fs.unlink(metaPath);

            try {
                const statusResult = await makeDaemonStatusHandler()({
                    options: { json: true },
                    arguments: {},
                });
                expect(statusResult.success).toBe(true);
                if (!statusResult.success) throw new Error('unreachable');
                expect(statusResult.data.data!.running).toBe(true);
                expect(statusResult.data.data!.metaStatus).toBe('missing');
                expect(statusResult.data.data!.inFlightLumpCount).toBeUndefined();
                expect(statusResult.data.data!.workspaceStrategy).toBeUndefined();
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

/**
 * daemon-id-and-filters DS1–DS6.
 * Skipped until daemon-status lists all project daemons / --daemonId detail.
 */
describe.skip('daemon-status command (daemon-id-and-filters DS*)', () => {
    let projectRoot: string;
    let globalConfigFolderPath: string;
    let localConfigFolderPath: string;
    const projectName = 'status-ds-project';

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-status-ds-'));
        globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-status-ds-global-'));
        setDaemonTestGlobalConfigFolder(globalConfigFolderPath);
        localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        execGit('init -b main', projectRoot);
        execGit('config user.email "test@test.com"', projectRoot);
        execGit('config user.name "Test"', projectRoot);
        execGit('commit --allow-empty -m "init"', projectRoot);
        await fs.mkdir(path.join(localConfigFolderPath, 'lumps', 'alpha'), { recursive: true });
        await fs.writeFile(
            path.join(localConfigFolderPath, 'project.json'),
            JSON.stringify({ projectName }),
            'utf-8',
        );
        await fs.writeFile(
            path.join(localConfigFolderPath, 'lumps', 'alpha', 'config.json'),
            minimalLumpConfigJson,
            'utf-8',
        );
        await fs.writeFile(
            path.join(localConfigFolderPath, 'local.json'),
            JSON.stringify({
                mode: 'dedicated',
                primaryBranch: 'main',
                workspaceStrategy: 'worktree',
            }),
            'utf-8',
        );
    });

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
        await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
    });

    function makeStatusHandler() {
        return daemonStatusCommand.handlerMaker({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
        });
    }

    function makeStartHandler() {
        return startCommand.handlerMaker({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            spawnFn: aliveDaemonSpawnFn,
        });
    }

    it('DS1: no-id status lists all alive daemons', async () => {
        expect((await makeStartHandler()({ options: {}, arguments: {} })).success).toBe(true);
        expect(
            (
                await makeStartHandler()({
                    options: { daemonId: 'agents', include: 'alpha' } as never,
                    arguments: {},
                })
            ).success,
        ).toBe(true);
        await waitForDaemonPidFile(
            path.join(globalConfigFolderPath, 'daemons', `${projectName}.global.daemon.pid`),
        );
        await waitForDaemonPidFile(
            path.join(globalConfigFolderPath, 'daemons', `${projectName}.agents.daemon.pid`),
        );

        const result = await makeStatusHandler()({ options: {}, arguments: {} });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        const data = result.data.data as unknown as {
            daemons?: Array<Record<string, unknown>>;
        };
        const list = data.daemons ?? (Array.isArray(result.data.data) ? result.data.data : null);
        expect(list).toBeTruthy();
        const ids = (list as Array<Record<string, unknown>>).map((d) => d.daemonId);
        expect(new Set(ids)).toEqual(new Set(['global', 'agents']));
        for (const entry of list as Array<Record<string, unknown>>) {
            for (const key of [
                'daemonId',
                'pid',
                'running',
                'cronSetup',
                'include',
                'exclude',
                'workspaceStrategy',
                'maxParallelRun',
                'inFlightLumpCount',
            ]) {
                expect(key in entry).toBe(true);
            }
        }
    });

    it('DS2: --daemonId single detail', async () => {
        expect(
            (
                await makeStartHandler()({
                    options: { daemonId: 'agents', include: 'alpha' } as never,
                    arguments: {},
                })
            ).success,
        ).toBe(true);
        await waitForDaemonPidFile(
            path.join(globalConfigFolderPath, 'daemons', `${projectName}.agents.daemon.pid`),
        );
        const result = await makeStatusHandler()({
            options: { daemonId: 'agents' } as never,
            arguments: {},
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(JSON.stringify(result.data.data)).toMatch(/agents/);
    });

    it('DS3: JSON list shape', async () => {
        expect((await makeStartHandler()({ options: {}, arguments: {} })).success).toBe(true);
        await waitForDaemonPidFile(
            path.join(globalConfigFolderPath, 'daemons', `${projectName}.global.daemon.pid`),
        );
        const result = await makeStatusHandler()({
            options: { json: true },
            arguments: {},
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.data).toBeTruthy();
    });

    it('DS4: deprecated --lumpName single detail + warn', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        try {
            expect(
                (
                    await makeStartHandler()({
                        options: { daemonId: 'alpha', include: 'alpha' } as never,
                        arguments: {},
                    })
                ).success,
            ).toBe(true);
            await waitForDaemonPidFile(
                path.join(globalConfigFolderPath, 'daemons', `${projectName}.alpha.daemon.pid`),
            );
            const result = await makeStatusHandler()({
                options: { lumpName: 'alpha' },
                arguments: {},
            });
            expect(result.success).toBe(true);
            const logged = [...warnSpy.mock.calls, ...logSpy.mock.calls]
                .map((c) => String(c[0]))
                .join('\n');
            expect(logged).toMatch(/deprecated|lumpName/i);
        } finally {
            warnSpy.mockRestore();
            logSpy.mockRestore();
        }
    });

    it('DS5: missing id → not-running / failure tone', async () => {
        const result = await makeStatusHandler()({
            options: { daemonId: 'nope' } as never,
            arguments: {},
        });
        if (result.success) {
            expect(JSON.stringify(result.data)).toMatch(/not running|nope/i);
        } else {
            expect(result.data.messages.join(' ')).toMatch(/not running|nope|not found/i);
        }
    });

    it('DS6: legacy bare appears as daemonId global in list', async () => {
        expect((await makeStartHandler()({ options: {}, arguments: {} })).success).toBe(true);
        const globalPid = path.join(
            globalConfigFolderPath,
            'daemons',
            `${projectName}.global.daemon.pid`,
        );
        const barePid = path.join(globalConfigFolderPath, 'daemons', `${projectName}.daemon.pid`);
        await waitForDaemonPidFile(globalPid);
        await fs.copyFile(globalPid, barePid);
        await fs.copyFile(
            globalPid.replace(/\.pid$/, '.meta.json'),
            barePid.replace(/\.pid$/, '.meta.json'),
        );
        await fs.rm(globalPid, { force: true });
        await fs.rm(globalPid.replace(/\.pid$/, '.meta.json'), { force: true });

        const result = await makeStatusHandler()({ options: {}, arguments: {} });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(JSON.stringify(result.data.data)).toMatch(/"daemonId"\s*:\s*"global"|global/);
    });
});
