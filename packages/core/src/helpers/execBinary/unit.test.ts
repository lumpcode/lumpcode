import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execBinary } from './main';

describe('execBinary', () => {
    it('should return success with stdout for a valid command', async () => {
        const result = await execBinary('echo', ['Hello, world!']);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.stdout).toContain('Hello, world!');
        }
    });

    it('should return failure for a non-zero exit code', async () => {
        const result = await execBinary('node', ['-e', 'process.exit(1)']);
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.data.code).toBe(1);
            expect(result.data.binaryPath).toBe('node');
        }
    });

    it('returns failure when spawn fails (missing cwd)', async () => {
        const result = await execBinary('node', ['-e', 'process.exit(0)'], 5000, {
            cwd: path.join(os.tmpdir(), 'lumpcode-execbinary-missing-cwd'),
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.data.message).toMatch(/ENOENT/i);
        }
    });

    it('should return failure on timeout', async () => {
        const result = await execBinary('sleep', ['10'], 50);
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.data.message).toContain('timed out');
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
        const result = await execBinary('mock-agent', ['--version']);

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.stdout).toMatch(/mock-agent 1\.0\.0/i);
        }
    });
});

