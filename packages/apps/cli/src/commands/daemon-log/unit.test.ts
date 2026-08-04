import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { spawn as nodeSpawn } from 'node:child_process';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { buildTailArgs, command as daemonLogCommand } from './main';
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

describe('buildTailArgs', () => {
    it('builds follow-only args by default', () => {
        expect(buildTailArgs('/tmp/foo.log')).toEqual(['-f', '/tmp/foo.log']);
    });

    it('builds lines + follow when lines set and not noFollow', () => {
        expect(buildTailArgs('/tmp/foo.log', 3)).toEqual(['-n', '3', '-f', '/tmp/foo.log']);
    });

    it('builds lines only when noFollow', () => {
        expect(buildTailArgs('/tmp/foo.log', 50, true)).toEqual(['-n', '50', '/tmp/foo.log']);
    });

    it('builds plain tail when noFollow without lines', () => {
        expect(buildTailArgs('/tmp/foo.log', undefined, true)).toEqual(['/tmp/foo.log']);
    });
});

describe('daemon-log command', () => {
    let projectRoot: string;
    let globalConfigFolderPath: string;
    let localConfigFolderPath: string;
    const projectName = 'daemon-log-test-project';

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-daemon-log-'));
        globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-daemon-log-global-'));
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

    it('fails when not a Lumpcode project root', async () => {
        const badRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-daemon-log-bad-'));
        const badGlobal = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-daemon-log-bad-global-'));
        try {
            await fs.mkdir(path.join(badRoot, '.lumpcode'), { recursive: true });
            const handle = daemonLogCommand.handlerMaker({
                projectRoot: badRoot,
                localConfigFolderPath: path.join(badRoot, '.lumpcode'),
                globalConfigFolderPath: badGlobal,
            });
            const result = await handle({ options: { noFollow: true }, arguments: {} });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data.messages[0]).toContain('Not a Lumpcode project root');
        } finally {
            await fs.rm(badRoot, { recursive: true, force: true });
            await fs.rm(badGlobal, { recursive: true, force: true });
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

    it('reads per-lump log with --lumpName', async () => {
        await writeLog(`${projectName}.alpha`, 'alpha one\nalpha two\n');

        const result = await makeHandler()({
            options: { lumpName: 'alpha', noFollow: true, lines: 2 },
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

    it('spawns tail -f by default in follow mode', async () => {
        const logPath = await writeLog(`${projectName}.global`, 'live\n');
        const spawnFn = makeFollowSpawnMock(['-f', logPath]);

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
});

/**
 * daemon-id-and-filters DL1–DL2.
 * Skipped until daemon-log defaults to project.global.daemon.log / --daemonId.
 */
describe('daemon-log command (daemon-id-and-filters DL*)', () => {
    let projectRoot: string;
    let globalConfigFolderPath: string;
    let localConfigFolderPath: string;
    const projectName = 'daemon-log-dl-project';

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-daemon-log-dl-'));
        globalConfigFolderPath = await fs.mkdtemp(
            path.join(os.tmpdir(), 'lump-daemon-log-dl-global-'),
        );
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
            JSON.stringify({ mode: 'dedicated', primaryBranch: 'main' }),
            'utf-8',
        );
    });

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
        await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
    });

    function makeHandler() {
        return daemonLogCommand.handlerMaker({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
        });
    }

    async function writeLog(relativeBase: string, content: string) {
        const daemonsDir = path.join(globalConfigFolderPath, 'daemons');
        await fs.mkdir(daemonsDir, { recursive: true });
        const logPath = path.join(daemonsDir, `${relativeBase}.daemon.log`);
        await fs.writeFile(logPath, content, 'utf-8');
        return logPath;
    }

    it('DL1: default reads project.global.daemon.log', async () => {
        await writeLog(`${projectName}.global`, 'g1\ng2\n');
        const result = await makeHandler()({
            options: { noFollow: true, lines: 2 },
            arguments: {},
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.messages).toEqual(['g1', 'g2']);
        expect(result.data.data!.logFilePath).toMatch(/\.global\.daemon\.log$/);
    });

    it('DL2: --daemonId opens that log', async () => {
        await writeLog(`${projectName}.agents`, 'a1\na2\n');
        const result = await makeHandler()({
            options: { daemonId: 'agents', noFollow: true, lines: 2 } as never,
            arguments: {},
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.messages).toEqual(['a1', 'a2']);
        expect(result.data.data!.logFilePath).toMatch(/\.agents\.daemon\.log$/);
    });
});
