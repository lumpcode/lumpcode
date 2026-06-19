import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveSpawnExecutable } from './main';

function stubPlatform(platform: NodeJS.Platform): void {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
}

describe('resolveSpawnExecutable (posix)', () => {
    it('returns the executable and args unchanged', () => {
        expect(resolveSpawnExecutable('copilot', ['-p', 'hi'])).toEqual({
            executable: 'copilot',
            args: ['-p', 'hi'],
        });
    });
});

describe('resolveSpawnExecutable (win32)', () => {
    let tmpDir = '';
    let previousPath = '';
    const originalPlatform = process.platform;

    beforeEach(async () => {
        stubPlatform('win32');
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lumpcode-resolve-spawn-'));
        previousPath = process.env.PATH ?? '';
        process.env.PATH = `${tmpDir}${path.delimiter}${previousPath}`;
    });

    afterEach(async () => {
        process.env.PATH = previousPath;
        stubPlatform(originalPlatform);
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('wraps a .cmd shim with cmd.exe', async () => {
        const shimName = 'lumpcode-mock-copilot-shim';
        const shimPath = path.join(tmpDir, `${shimName}.cmd`);
        await fs.writeFile(shimPath, '@echo off\r\necho copilot-shim\r\n');

        const resolved = resolveSpawnExecutable(shimPath, ['-p', 'hello']);

        expect(resolved.executable.toLowerCase()).toMatch(/cmd\.exe$/);
        expect(resolved.args[0]).toBe('/d');
        expect(resolved.args[1]).toBe('/s');
        expect(resolved.args[2]).toBe('/c');
        expect(resolved.args[3]).toBe(path.resolve(shimPath));
        expect(resolved.args.slice(4)).toEqual(['-p', 'hello']);
    });

    it.skipIf(process.platform !== 'win32')('resolves a bare .cmd name from PATH', async () => {
        const shimName = 'lumpcode-mock-copilot-shim-path';
        const shimPath = path.join(tmpDir, `${shimName}.cmd`);
        await fs.writeFile(shimPath, '@echo off\r\necho copilot-shim\r\n');

        const resolved = resolveSpawnExecutable(shimName, ['-p', 'hello']);

        expect(resolved.executable.toLowerCase()).toMatch(/cmd\.exe$/);
        expect(resolved.args[3]).toBe(path.resolve(shimPath));
    });

    it('runs extensionless node entrypoints with process.execPath', async () => {
        const entryName = 'lumpcode-mock-node-agent';
        const entryPath = path.join(tmpDir, entryName);
        await fs.writeFile(entryPath, '#!/usr/bin/env node\nconsole.log("node-shim");\n');

        const resolved = resolveSpawnExecutable(entryName, ['--version']);

        expect(resolved.executable).toBe(process.execPath);
        expect(resolved.args).toEqual([entryPath, '--version']);
    });

    it('leaves an absolute .exe path unchanged', async () => {
        const exePath = path.join(tmpDir, 'tool.exe');
        await fs.writeFile(exePath, '');

        const resolved = resolveSpawnExecutable(exePath, ['run']);

        expect(resolved.executable).toBe(exePath);
        expect(resolved.args).toEqual(['run']);
    });
});
