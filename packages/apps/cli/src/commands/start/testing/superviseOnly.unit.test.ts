import * as fs from 'node:fs/promises';
import { spawn as nodeSpawn } from 'node:child_process';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { aliveDaemonSpawnFn } from '../../../testing';
import {
    daemonSchedulerFiles,
    daemonsDirPath,
    stopSupervisor,
    supervisorMetaPath,
    supervisorPidPath,
} from '../../../utils';
import {
    makeStartHandler,
    setupStartTestRepo,
    stopDaemon,
    teardownStartTestRepo,
    writeDefaultLocalJson,
} from './testHelpers';

const PROJECT_NAME = 'supervise-only-project';

describe('start --superviseOnly', () => {
    let projectRoot: string;
    let remoteDir: string;
    let globalConfigFolderPath: string;

    beforeEach(async () => {
        const project = await setupStartTestRepo({
            tmpPrefix: 'lump-start-supervise-only',
            projectName: PROJECT_NAME,
        });
        projectRoot = project.projectRoot;
        remoteDir = project.remoteDir;
        globalConfigFolderPath = project.globalConfigFolderPath;
        await writeDefaultLocalJson(projectRoot);
    });

    afterEach(async () => {
        await stopDaemon(deps(), { daemonId: 'global' });
        await stopSupervisor({
            pidFilePath: supervisorPidPath({ globalConfigFolderPath, projectName: PROJECT_NAME }),
            metaFilePath: supervisorMetaPath({ globalConfigFolderPath, projectName: PROJECT_NAME }),
            force: true,
            waitMs: 2000,
        });
        await teardownStartTestRepo({ projectRoot, remoteDir, globalConfigFolderPath });
    });

    const deps = () => ({ projectRoot, remoteDir, globalConfigFolderPath });

    async function runSuperviseOnly(spawnFn: typeof nodeSpawn = aliveDaemonSpawnFn) {
        const handle = makeStartHandler(deps(), {
            spawnFn,
            skipEnsureSupervisor: false,
        });
        return handle({
            options: { superviseOnly: true },
            arguments: {},
        });
    }

    it.each([
        { label: '--include', options: { include: 'alpha' } },
        { label: '--exclude', options: { exclude: '*' } },
        { label: '--daemonId', options: { daemonId: 'nightly' } },
        { label: '--cronSetup', options: { cronSetup: '*/5 * * * *' } },
        { label: '--maxParallelRun', options: { maxParallelRun: 2 } },
        { label: '--lumpName', options: { lumpName: 'alpha' } },
        { label: '--foreground', options: { foreground: true } },
    ] as const)('fails when combined with $label', async ({ options, label }) => {
        const handle = makeStartHandler(deps());
        const result = await handle({
            options: { superviseOnly: true, ...options },
            arguments: {},
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages[0]).toContain('--superviseOnly cannot be combined with');
        expect(result.data.messages[0]).toContain(label);
    });

    it('starts supervise without writing daemon desired or pid files', async () => {
        const spawnSpy = vi.fn(aliveDaemonSpawnFn) as unknown as typeof nodeSpawn;
        const result = await runSuperviseOnly(spawnSpy);
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.data).toEqual({
            projectName: PROJECT_NAME,
            supervisorPid: expect.any(Number),
        });
        expect('daemonId' in (result.data.data ?? {})).toBe(false);

        const spawnCalls = (spawnSpy as unknown as ReturnType<typeof vi.fn>).mock.calls;
        expect(spawnCalls.some((call) => (call[1] as string[]).includes('supervise'))).toBe(true);
        expect(spawnCalls.every((call) => !(call[1] as string[]).includes('--daemonId'))).toBe(true);

        const daemonFiles = daemonSchedulerFiles({
            daemonsDir: daemonsDirPath({ globalConfigFolderPath }),
            projectName: PROJECT_NAME,
            daemonId: 'global',
        });
        await expect(fs.access(daemonFiles.desiredFilePath)).rejects.toMatchObject({ code: 'ENOENT' });
        await expect(fs.access(daemonFiles.pidFilePath)).rejects.toMatchObject({ code: 'ENOENT' });

        const supervisorPid = result.data.data.supervisorPid;
        expect(supervisorPid).toBeTypeOf('number');
        await expect(
            fs.readFile(supervisorPidPath({ globalConfigFolderPath, projectName: PROJECT_NAME }), 'utf8'),
        ).resolves.toBe(String(supervisorPid));
    });

    it('is idempotent when supervise is already alive', async () => {
        const first = await runSuperviseOnly();
        expect(first.success).toBe(true);
        if (!first.success) throw new Error('unreachable');
        const firstPid = first.data.data.supervisorPid;
        expect(firstPid).toBeTypeOf('number');

        const spawnSpy = vi.fn(aliveDaemonSpawnFn) as unknown as typeof nodeSpawn;
        const second = await runSuperviseOnly(spawnSpy);
        expect(second.success).toBe(true);
        if (!second.success) throw new Error('unreachable');
        expect(second.data.data.supervisorPid).toBe(firstPid);
        expect((spawnSpy as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    });

    it('still starts a real daemon for --exclude=* without --superviseOnly', async () => {
        const handle = makeStartHandler(deps(), { spawnFn: aliveDaemonSpawnFn });
        const result = await handle({
            options: { exclude: '*' },
            arguments: {},
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        const data = result.data.data;
        expect(data).toBeDefined();
        expect(data).toMatchObject({ exclude: ['*'] });
        expect(data && 'daemonId' in data && typeof data.daemonId === 'string').toBe(true);
        if (!data || !('daemonId' in data)) throw new Error('unreachable');
        const daemonId = data.daemonId;

        const daemonFiles = daemonSchedulerFiles({
            daemonsDir: daemonsDirPath({ globalConfigFolderPath }),
            projectName: PROJECT_NAME,
            daemonId,
        });
        await expect(fs.access(daemonFiles.desiredFilePath)).resolves.toBeUndefined();
        await expect(fs.access(daemonFiles.pidFilePath)).resolves.toBeUndefined();
        await stopDaemon(deps(), { daemonId });
    });
});
