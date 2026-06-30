import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { execSync, spawn as nodeSpawn } from 'node:child_process';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
    aliveDaemonSpawnFn,
    setDaemonTestGlobalConfigFolder,
    waitForDaemonMetaFile,
    waitForDaemonPidFile,
} from '../../testing';
import { command as startCommand } from '../start/main';
import { command as restartCommand } from './main';

function git(cmd: string, cwd: string) {
    execSync(`git ${cmd}`, { cwd, stdio: 'pipe' });
}

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

describe('restart command', () => {
    let projectRoot: string;
    let globalConfigFolderPath: string;
    let localConfigFolderPath: string;
    const projectName = 'restart-test-project';
    const pidPath = () => path.join(globalConfigFolderPath, 'daemons', `${projectName}.daemon.pid`);
    const metaPath = () => path.join(globalConfigFolderPath, 'daemons', `${projectName}.daemon.meta.json`);

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-restart-'));
        globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-restart-global-'));
        setDaemonTestGlobalConfigFolder(globalConfigFolderPath);
        localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        git('init -b main', projectRoot);
        git('config user.email "test@test.com"', projectRoot);
        git('config user.name "Test"', projectRoot);
        git('commit --allow-empty -m "init"', projectRoot);
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
            JSON.stringify({ mode: 'dedicated', discoveryBranch: 'main' }),
            'utf-8',
        );
    });

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
        await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
    });

    function makeRestartHandler(
        overrides: Partial<Parameters<typeof restartCommand.handlerMaker>[0]> = {},
    ) {
        return restartCommand.handlerMaker({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            ...overrides,
        });
    }

    async function runStart(spawnFn: typeof aliveDaemonSpawnFn, options: { cronSetup?: string } = {}) {
        const handle = startCommand.handlerMaker({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            spawnFn,
        });
        const result = await handle({ options, arguments: {} });
        expect(result.success).toBe(true);
    }

    it('fails when not a Lumpcode project root', async () => {
        const badRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-restart-bad-'));
        const badGlobal = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-restart-bad-global-'));
        try {
            await fs.mkdir(path.join(badRoot, '.lumpcode'), { recursive: true });
            const handle = restartCommand.handlerMaker({
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

    it('fails when no daemon is running (stop fails before start is attempted)', async () => {
        const spawnFn = vi.fn() as unknown as typeof nodeSpawn;
        const result = await makeRestartHandler({ spawnFn })({ options: {}, arguments: {} });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages[0]).toContain('No daemon PID file');
        expect(spawnFn).not.toHaveBeenCalled();
    });

    it('stops the running daemon and starts a new one, preserving the previous cron schedule', async () => {
        const originalCron = '*/7 * * * *';
        await runStart(aliveDaemonSpawnFn, { cronSetup: originalCron });
        await waitForDaemonPidFile(pidPath());
        await waitForDaemonMetaFile(metaPath());

        const initialRaw = await fs.readFile(pidPath(), 'utf8');
        const initialPid = Number.parseInt(initialRaw.trim(), 10);
        expect(Number.isNaN(initialPid)).toBe(false);

        const initialMeta = JSON.parse(await fs.readFile(metaPath(), 'utf8')) as { cronSetup: string };
        expect(initialMeta.cronSetup).toBe(originalCron);

        const restartSpawnFn = vi.fn(
            (command: string, args?: readonly string[] | Record<string, unknown>, options?: Parameters<typeof nodeSpawn>[2]) => {
                expect(Array.isArray(args)).toBe(true);
                const argList = args as readonly string[];
                expect(argList).toContain('start');
                expect(argList).toContain('--cronSetup');
                expect(argList).toContain(originalCron);
                return aliveDaemonSpawnFn(command, argList, options ?? {});
            },
        ) as unknown as typeof nodeSpawn;

        const result = await makeRestartHandler({ spawnFn: restartSpawnFn })({
            options: {},
            arguments: {},
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.messages.some((m) => m.includes('Stopped Lumpcode daemon'))).toBe(true);
        expect(result.data.messages.some((m) => m.includes('Lumpcode daemon started'))).toBe(true);
        expect(result.data.data?.cronSetup).toBe(originalCron);
        expect(restartSpawnFn).toHaveBeenCalledOnce();

        await waitForDaemonPidFile(pidPath());
        const finalPid = Number.parseInt((await fs.readFile(pidPath(), 'utf8')).trim(), 10);
        expect(Number.isNaN(finalPid)).toBe(false);
        expect(finalPid).not.toBe(initialPid);

        const finalMeta = JSON.parse(await fs.readFile(metaPath(), 'utf8')) as { cronSetup: string };
        expect(finalMeta.cronSetup).toBe(originalCron);

        try {
            process.kill(initialPid, 0);
            throw new Error('expected original child to be dead');
        } catch (e) {
            expect(e).toMatchObject({ code: 'ESRCH' });
        }
    });

    it('falls back to the default cron schedule when the meta file is missing', async () => {
        await runStart(aliveDaemonSpawnFn, { cronSetup: '*/9 * * * *' });
        await waitForDaemonPidFile(pidPath());
        await waitForDaemonMetaFile(metaPath());

        await fs.unlink(metaPath());

        const restartSpawnFn = vi.fn(
            (command: string, args?: readonly string[] | Record<string, unknown>, options?: Parameters<typeof nodeSpawn>[2]) => {
                const argList = args as readonly string[];
                const cronIdx = argList.indexOf('--cronSetup');
                expect(cronIdx).toBeGreaterThanOrEqual(0);
                expect(argList[cronIdx + 1]).toBe('*/5 * * * *');
                return aliveDaemonSpawnFn(command, argList, options ?? {});
            },
        ) as unknown as typeof nodeSpawn;

        const result = await makeRestartHandler({ spawnFn: restartSpawnFn })({
            options: {},
            arguments: {},
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.data?.cronSetup).toBe('*/5 * * * *');
    });
});
