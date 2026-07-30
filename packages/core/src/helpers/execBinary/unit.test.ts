import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SpawnOptions } from 'node:child_process';

import {
    probeAlive,
    waitForPidGone,
    waitForReadyFile,
} from '../../testing/processTreeTestHelpers';
import { windowsNpmCmdShimBody } from '../../utils/resolveSpawnExecutable/windowsNpmCmdShimBody';
import { execBinary } from './main';

/**
 * Future object API for kill-spawned-command-on-timeout-abort.
 * Cast until execBinary is refactored off the positional signature.
 */
type ExecBinaryObjectInput = {
    binaryPath: string;
    args: string[];
    timeoutMillis?: number;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    stdio?: SpawnOptions['stdio'];
    signal?: AbortSignal;
    killGraceMs?: number;
};

type ExecBinaryObjectFailure = {
    message: string;
    binaryPath: string;
    args: string[];
    code?: number;
    stdout?: string;
    stderr?: string;
    reason?: 'timeout' | 'aborted' | 'exit' | 'spawn';
};

type ExecBinaryObjectResult =
    | { success: true; data: { stdout: string; stderr: string } }
    | { success: false; data: ExecBinaryObjectFailure };

const execBinaryObject = execBinary as unknown as (
    input: ExecBinaryObjectInput,
) => Promise<ExecBinaryObjectResult>;

const processTreeChildScript = fileURLToPath(
    new URL('../../testing/processTreeChild.cjs', import.meta.url),
);

describe('execBinary', () => {
    it('should return success with stdout for a valid command', async () => {
        const result = await execBinary({ binaryPath: 'echo', args: ['Hello, world!'] });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.stdout).toContain('Hello, world!');
        }
    });

    it('should return failure for a non-zero exit code', async () => {
        const result = await execBinary({ binaryPath: 'node', args: ['-e', 'process.exit(1)'] });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.data.code).toBe(1);
            expect(result.data.binaryPath).toBe('node');
            expect(result.data.reason).toBe('exit');
        }
    });

    it('returns failure when spawn fails (missing cwd)', async () => {
        const result = await execBinary({
            binaryPath: 'node',
            args: ['-e', 'process.exit(0)'],
            timeoutMillis: 5000,
            cwd: path.join(os.tmpdir(), 'lumpcode-execbinary-missing-cwd'),
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.data.message).toMatch(/ENOENT/i);
            expect(result.data.reason).toBe('spawn');
        }
    });

    it('should return failure on timeout', async () => {
        const result = await execBinary({
            binaryPath: 'sleep',
            args: ['10'],
            timeoutMillis: 50,
            killGraceMs: 0,
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.data.message).toContain('timed out');
            expect(result.data.reason).toBe('timeout');
        }
    });
});

describe('execBinary (win32 cmd shim)', () => {
    let tmpDir = '';
    let previousPath = '';

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lumpcode-execbinary-win32-'));
        previousPath = process.env.PATH ?? '';
        process.env.PATH = `${tmpDir}${path.delimiter}${previousPath}`;

        const shimPath = path.join(tmpDir, 'mock-agent.cmd');
        await fs.writeFile(
            shimPath,
            '@echo off\r\nif "%~1"=="--version" (echo mock-agent 1.0.0) else (echo %*)\r\n',
        );
    });

    afterEach(async () => {
        process.env.PATH = previousPath;
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it.skipIf(process.platform !== 'win32')('runs a PATH-resolved .cmd shim', async () => {
        const result = await execBinary({ binaryPath: 'mock-agent', args: ['--version'] });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.stdout).toMatch(/mock-agent 1\.0\.0/i);
        }
    });

    it.skipIf(process.platform !== 'win32')(
        'preserves multiline backtick prompts through an unwrapped Windows npm-cmd-shim',
        async () => {
            const scriptRel = path.join('node_modules', 'echo-agent', 'bin.js');
            await fs.mkdir(path.join(tmpDir, 'node_modules', 'echo-agent'), { recursive: true });
            await fs.writeFile(
                path.join(tmpDir, scriptRel),
                'process.stdout.write(JSON.stringify(process.argv.slice(2)));\n',
            );
            await fs.writeFile(
                path.join(tmpDir, 'echo-agent.cmd'),
                windowsNpmCmdShimBody(scriptRel),
            );

            const prompt = 'Look at `src/foo.ts:42`\n```ts\nconst x = 1;\n```';
            const result = await execBinary({ binaryPath: 'echo-agent', args: ['-p', prompt] });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(JSON.parse(result.data.stdout)).toEqual(['-p', prompt]);
            }
        },
    );
});

describe('execBinary object API + kill on timeout/abort (E1–E9)', () => {
    const activePids = new Set<number>();
    let tmpDir = '';

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lumpcode-execbinary-kill-'));
    });

    afterEach(async () => {
        for (const pid of activePids) {
            try {
                process.kill(pid, 'SIGKILL');
            } catch {
                // already gone
            }
        }
        activePids.clear();
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('E1: success with object API', async () => {
        const result = await execBinaryObject({
            binaryPath: 'echo',
            args: ['Hello, world!'],
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.stdout).toContain('Hello, world!');
        }
    });

    it('E2: non-zero exit has reason exit', async () => {
        const result = await execBinaryObject({
            binaryPath: 'node',
            args: ['-e', 'process.exit(1)'],
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.data.reason).toBe('exit');
            expect(result.data.code).toBe(1);
            expect(result.data.binaryPath).toBe('node');
            expect(result.data.args).toEqual(['-e', 'process.exit(1)']);
        }
    });

    it('E3: spawn failure has reason spawn', async () => {
        const result = await execBinaryObject({
            binaryPath: 'node',
            args: ['-e', 'process.exit(0)'],
            cwd: path.join(os.tmpdir(), 'lumpcode-execbinary-missing-cwd-object'),
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.data.reason).toBe('spawn');
            expect(result.data.message).toMatch(/ENOENT/i);
            expect(result.data.binaryPath).toBe('node');
        }
    });

    it('E4: timeout abandons and kills the process tree', async () => {
        const readyFile = path.join(tmpDir, 'ready-e4.json');

        const resultPromise = execBinaryObject({
            binaryPath: process.execPath,
            args: [processTreeChildScript],
            // Generous under parallel vitest load so the fixture can write its ready file
            // before timeout kill; still far below production defaults.
            timeoutMillis: 2000,
            killGraceMs: 0,
            cwd: tmpDir,
            env: {
                ...process.env,
                LUMPCODE_TREE_CHILD_DEPTH: '0',
                LUMPCODE_TREE_READY_FILE: readyFile,
            },
        });

        const { pids } = await waitForReadyFile(readyFile);
        for (const pid of pids) activePids.add(pid);

        const result = await resultPromise;
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.data.reason).toBe('timeout');
            expect(result.data.message).toMatch(/timed out/i);
            expect(result.data.message).toMatch(/2000/);
        }

        for (const pid of pids) {
            await waitForPidGone(pid);
            expect(probeAlive(pid)).toBe(false);
            activePids.delete(pid);
        }
    });

    it('E5: timeout kills descendants', async () => {
        const readyFile = path.join(tmpDir, 'ready-tree.json');

        const resultPromise = execBinaryObject({
            binaryPath: process.execPath,
            args: [processTreeChildScript],
            timeoutMillis: 2000,
            killGraceMs: 0,
            cwd: tmpDir,
            env: {
                ...process.env,
                LUMPCODE_TREE_CHILD_DEPTH: '1',
                LUMPCODE_TREE_READY_FILE: readyFile,
            },
        });

        const { pids } = await waitForReadyFile(readyFile);
        expect(pids.length).toBeGreaterThanOrEqual(2);
        for (const pid of pids) activePids.add(pid);

        const result = await resultPromise;
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.data.reason).toBe('timeout');
        }

        for (const pid of pids) {
            await waitForPidGone(pid);
            expect(probeAlive(pid)).toBe(false);
            activePids.delete(pid);
        }
    });

    it('E6: abort before spawn returns reason aborted', async () => {
        const controller = new AbortController();
        controller.abort();

        const result = await execBinaryObject({
            binaryPath: 'echo',
            args: ['should-not-run'],
            signal: controller.signal,
            killGraceMs: 0,
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.data.reason).toBe('aborted');
            expect(result.data.message).toMatch(/abort/i);
        }
    });

    it('E7: abort during run kills the process tree', async () => {
        const readyFile = path.join(tmpDir, 'ready-abort.json');
        const controller = new AbortController();

        const resultPromise = execBinaryObject({
            binaryPath: process.execPath,
            args: [processTreeChildScript],
            signal: controller.signal,
            killGraceMs: 0,
            cwd: tmpDir,
            env: {
                ...process.env,
                LUMPCODE_TREE_CHILD_DEPTH: '0',
                LUMPCODE_TREE_READY_FILE: readyFile,
            },
        });

        const { pids } = await waitForReadyFile(readyFile);
        for (const pid of pids) activePids.add(pid);
        controller.abort();

        const result = await resultPromise;
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.data.reason).toBe('aborted');
            expect(result.data.message).toMatch(/abort/i);
        }

        for (const pid of pids) {
            await waitForPidGone(pid);
            expect(probeAlive(pid)).toBe(false);
            activePids.delete(pid);
        }
    });

    it('E8: failure data includes binaryPath, args, and reason', async () => {
        const result = await execBinaryObject({
            binaryPath: 'node',
            args: ['-e', 'process.exit(2)'],
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.data.binaryPath).toBe('node');
            expect(result.data.args).toEqual(['-e', 'process.exit(2)']);
            expect(result.data.reason).toBe('exit');
            expect(result.data.code).toBe(2);
        }
    });

    it.skipIf(process.platform !== 'win32')('E9: win32 PATH .cmd shim via object API', async () => {
        const previousPath = process.env.PATH ?? '';
        process.env.PATH = `${tmpDir}${path.delimiter}${previousPath}`;
        try {
            await fs.writeFile(
                path.join(tmpDir, 'mock-agent.cmd'),
                '@echo off\r\nif "%~1"=="--version" (echo mock-agent 1.0.0) else (echo %*)\r\n',
            );
            const result = await execBinaryObject({
                binaryPath: 'mock-agent',
                args: ['--version'],
            });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.stdout).toMatch(/mock-agent 1\.0\.0/i);
            }
        } finally {
            process.env.PATH = previousPath;
        }
    });
});
