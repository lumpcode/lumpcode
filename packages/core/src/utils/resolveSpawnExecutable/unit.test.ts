import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveSpawnExecutable } from './main';
import { windowsNpmCmdShimBody } from './windowsNpmCmdShimBody';

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

    it('wraps a plain .cmd batch file with cmd.exe when unwrap is impossible', async () => {
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

    it.skipIf(process.platform !== 'win32')('resolves a bare plain .cmd name from PATH via cmd.exe', async () => {
        const shimName = 'lumpcode-mock-copilot-shim-path';
        const shimPath = path.join(tmpDir, `${shimName}.cmd`);
        await fs.writeFile(shimPath, '@echo off\r\necho copilot-shim\r\n');

        const resolved = resolveSpawnExecutable(shimName, ['-p', 'hello']);

        expect(resolved.executable.toLowerCase()).toMatch(/cmd\.exe$/);
        expect(resolved.args[3]).toBe(path.resolve(shimPath));
    });

    it('unwraps a Windows npm-cmd-shim .cmd to node + script.js', async () => {
        const scriptRel = path.join('node_modules', 'mock-agent', 'bin.js');
        const scriptPath = path.join(tmpDir, scriptRel);
        await fs.mkdir(path.dirname(scriptPath), { recursive: true });
        await fs.writeFile(scriptPath, 'console.log(JSON.stringify(process.argv.slice(2)));\n');

        const shimPath = path.join(tmpDir, 'mock-agent.cmd');
        await fs.writeFile(shimPath, windowsNpmCmdShimBody(scriptRel));

        const prompt = 'Look at `src/foo.ts:42`\n```ts\nconst x = 1;\n```';
        const resolved = resolveSpawnExecutable(shimPath, ['-p', prompt, '--force']);

        expect(resolved.executable.toLowerCase()).not.toMatch(/cmd\.exe$/);
        expect(resolved.args[0]).toBe(scriptPath);
        expect(resolved.args.slice(1)).toEqual(['-p', prompt, '--force']);
    });

    it('unwraps yarn-style %~dp0 .cmd shims', async () => {
        const scriptRel = path.join('..', 'mock-agent', 'cli.js');
        const scriptPath = path.resolve(tmpDir, scriptRel);
        await fs.mkdir(path.dirname(scriptPath), { recursive: true });
        await fs.writeFile(scriptPath, 'export {};\n');

        const shimPath = path.join(tmpDir, 'yarn-style-agent.cmd');
        await fs.writeFile(
            shimPath,
            [
                '@IF EXIST "%~dp0\\node.exe" (',
                `  "%~dp0\\node.exe"  "%~dp0\\${scriptRel.replace(/\//g, '\\')}" %*`,
                ') ELSE (',
                '  @SETLOCAL',
                '  @SET PATHEXT=%PATHEXT:;.JS;=;%',
                `  node  "%~dp0\\${scriptRel.replace(/\//g, '\\')}" %*`,
                ')',
                '',
            ].join('\r\n'),
        );

        const resolved = resolveSpawnExecutable(shimPath, ['-p', 'hi']);

        expect(resolved.executable.toLowerCase()).not.toMatch(/cmd\.exe$/);
        expect(resolved.args).toEqual([scriptPath, '-p', 'hi']);
    });

    it('falls back to cmd.exe when the referenced .js is missing', async () => {
        const shimPath = path.join(tmpDir, 'broken-agent.cmd');
        await fs.writeFile(shimPath, windowsNpmCmdShimBody(path.join('missing', 'bin.js')));

        const resolved = resolveSpawnExecutable(shimPath, ['-p', 'hi']);

        expect(resolved.executable.toLowerCase()).toMatch(/cmd\.exe$/);
        expect(resolved.args.slice(0, 4)).toEqual(['/d', '/s', '/c', path.resolve(shimPath)]);
    });

    it('does not wrap with cmd.exe when the .js exists (uses node, not cmd)', async () => {
        const scriptRel = path.join('node_modules', 'agent', 'bin.js');
        const scriptPath = path.join(tmpDir, scriptRel);
        await fs.mkdir(path.dirname(scriptPath), { recursive: true });
        await fs.writeFile(scriptPath, 'export {};\n');
        const shimPath = path.join(tmpDir, 'agent.cmd');
        await fs.writeFile(shimPath, windowsNpmCmdShimBody(scriptRel));

        const resolved = resolveSpawnExecutable(shimPath, ['-p', 'x']);

        expect(resolved.executable.toLowerCase()).not.toMatch(/cmd\.exe$/);
        expect(resolved.args[0]).toBe(scriptPath);
    });

    it('runs extensionless node entrypoints with a real Node binary', async () => {
        const entryName = 'lumpcode-mock-node-agent';
        const entryPath = path.join(tmpDir, entryName);
        await fs.writeFile(entryPath, '#!/usr/bin/env node\nconsole.log("node-shim");\n');

        const resolved = resolveSpawnExecutable(entryName, ['--version']);

        expect(resolved.executable.toLowerCase()).not.toMatch(/cmd\.exe$/);
        expect(resolved.executable).not.toMatch(/\.cmd$/i);
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
