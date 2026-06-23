import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
    copyEsbuildSidecar,
    esbuildPlatformBinaryRelativePath,
    esbuildPlatformPackageName,
    esbuildSidecarFileName,
    resolveEsbuildBinaryPath,
} from './esbuild-sidecar.mjs';

const cliRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('esbuild-sidecar', () => {
    /** @type {string[]} */
    const tempDirs = [];

    afterEach(async () => {
        for (const dir of tempDirs.splice(0)) {
            await fs.promises.rm(dir, { recursive: true, force: true });
        }
    });

    it('maps platform package names', () => {
        expect(esbuildPlatformPackageName('win32', 'x64')).toBe('@esbuild/win32-x64');
        expect(esbuildPlatformPackageName('linux', 'arm64')).toBe('@esbuild/linux-arm64');
        expect(esbuildPlatformPackageName('darwin', 'x64')).toBe('@esbuild/darwin-x64');
    });

    it('maps platform binary paths inside @esbuild packages', () => {
        expect(esbuildPlatformBinaryRelativePath('win32')).toBe('esbuild.exe');
        expect(esbuildPlatformBinaryRelativePath('linux')).toBe(path.join('bin', 'esbuild'));
    });

    it('resolves the installed platform binary from the CLI package root', () => {
        const resolved = resolveEsbuildBinaryPath({
            pkgRoot: cliRoot,
            platform: process.platform,
            arch: process.arch,
        });

        expect(resolved).toBeTruthy();
        expect(fs.existsSync(resolved)).toBe(true);
        expect(path.basename(resolved)).toBe(esbuildSidecarFileName(process.platform));
    });

    it('copyEsbuildSidecar writes the sidecar into destDir', () => {
        const destDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumpcode-esbuild-sidecar-'));
        tempDirs.push(destDir);

        expect(copyEsbuildSidecar({ pkgRoot: cliRoot, destDir })).toBe(true);
        expect(fs.existsSync(path.join(destDir, esbuildSidecarFileName(process.platform)))).toBe(true);
    });
});
