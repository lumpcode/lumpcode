import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { spawn as nodeSpawn } from 'node:child_process';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { createDaemonCommandTestProject } from '../../testing';
import { command as daemonLogCommand } from './main';
import { createTempTestDirs, removeTempTestDirs } from '../../utils';

describe('daemon-log command', () => {
    let projectRoot: string;
    let globalConfigFolderPath: string;
    let localConfigFolderPath: string;
    const projectName = 'daemon-log-test-project';

    beforeEach(async () => {
        ({ projectRoot, globalConfigFolderPath, localConfigFolderPath } = await createDaemonCommandTestProject({ prefix: 'lump-daemon-log-', projectName, bindDaemonTestEnv: false }));
    });

    afterEach(async () => {
        await removeTempTestDirs({ projectRoot, globalConfigFolderPath });
    });

    function makeHandler(spawnFn?: typeof nodeSpawn) {
        return daemonLogCommand.handlerMaker({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            ...(spawnFn !== undefined ? { spawnFn } : {}),
        });
    }

    async function writeLog(relativeBase: string, content: string) {
        const daemonsDir = path.join(globalConfigFolderPath, 'daemons');
        await fs.mkdir(daemonsDir, { recursive: true });
        const logPath = path.join(daemonsDir, `${relativeBase}.daemon.log`);
        await fs.writeFile(logPath, content, 'utf-8');
        return logPath;
    }

    function twelveLines() {
        return Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
    }

    it('fails when not a Lumpcode project root', async () => {
        const dirs = await createTempTestDirs({ prefix: 'lump-daemon-log-bad-', remote: false });
        try {
            const handle = daemonLogCommand.handlerMaker({
                projectRoot: dirs.projectRoot,
                localConfigFolderPath: dirs.localConfigFolderPath,
                globalConfigFolderPath: dirs.globalConfigFolderPath,
            });
            const result = await handle({ options: { noFollow: true }, arguments: {} });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.messages[0]).toContain('Not a Lumpcode project root');
        } finally {
            await removeTempTestDirs(dirs);
        }
    });

    it('fails when log file does not exist', async () => {
        const result = await makeHandler()({ options: { noFollow: true }, arguments: {} });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.messages[0]).toContain('No daemon log file');
    });

    it('prints last N lines with --noFollow --lines', async () => {
        await writeLog(`${projectName}.global`, 'line one\nline two\nline three\n');

        const result = await makeHandler()({
            options: { noFollow: true, lines: 2 },
            arguments: {},
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.messages).toEqual(['line two', 'line three']);
        expect(result.data.data!.lines).toEqual(['line two', 'line three']);
        expect(result.data.data!.logFilePath).toMatch(/daemon-log-test-project\.global\.daemon\.log$/);
    });

    it('prints last 10 lines when --lines is omitted', async () => {
        await writeLog(`${projectName}.global`, twelveLines());

        const result = await makeHandler()({
            options: { noFollow: true },
            arguments: {},
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.messages).toEqual(
            Array.from({ length: 10 }, (_, i) => `line ${i + 3}`),
        );
    });

    it('prints the whole log with --lines 0', async () => {
        await writeLog(`${projectName}.global`, twelveLines());

        const result = await makeHandler()({
            options: { noFollow: true, lines: 0 },
            arguments: {},
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.messages).toEqual(
            Array.from({ length: 12 }, (_, i) => `line ${i + 1}`),
        );
    });

    it('reads filtered daemon log with --daemonId', async () => {
        await writeLog(`${projectName}.alpha`, 'alpha one\nalpha two\n');

        const result = await makeHandler()({
            options: { daemonId: 'alpha', noFollow: true, lines: 2 },
            arguments: {},
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.messages).toEqual(['alpha one', 'alpha two']);
        expect(result.data.data!.daemonId).toBe('alpha');
        expect(result.data.data!.logFilePath).toMatch(/\.alpha\.daemon\.log$/);
    });

    function makeFollowSpawnMock(expectedArgs: string[]) {
        return vi.fn((command: string, args: readonly string[]) => {
            expect(command).toBe('tail');
            expect(args).toEqual(expectedArgs);
            const child = new EventEmitter() as ReturnType<typeof nodeSpawn>;
            Object.assign(child, { stdout: null, stderr: null, kill: vi.fn() });
            queueMicrotask(() => child.emit('close', 0, null));
            return child;
        }) as unknown as typeof nodeSpawn;
    }

    it('spawns tail -n 10 -f by default in follow mode', async () => {
        const logPath = await writeLog(`${projectName}.global`, 'live\n');
        const spawnFn = makeFollowSpawnMock(['-n', '10', '-f', logPath]);

        const result = await makeHandler(spawnFn)({ options: {}, arguments: {} });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(spawnFn).toHaveBeenCalledOnce();
        expect(result.data.messages[0]).toContain('Stopped following');
    });

    it('spawns tail -n N -f when --lines without --noFollow', async () => {
        const logPath = await writeLog(`${projectName}.global`, 'a\nb\nc\n');
        const spawnFn = makeFollowSpawnMock(['-n', '3', '-f', logPath]);

        const result = await makeHandler(spawnFn)({ options: { lines: 3 }, arguments: {} });
        expect(result.success).toBe(true);
        expect(spawnFn).toHaveBeenCalledOnce();
    });

    it('spawns tail -n +1 -f when --lines 0 without --noFollow', async () => {
        const logPath = await writeLog(`${projectName}.global`, twelveLines());
        const spawnFn = makeFollowSpawnMock(['-n', '+1', '-f', logPath]);

        const result = await makeHandler(spawnFn)({ options: { lines: 0 }, arguments: {} });
        expect(result.success).toBe(true);
        expect(spawnFn).toHaveBeenCalledOnce();
    });
});
