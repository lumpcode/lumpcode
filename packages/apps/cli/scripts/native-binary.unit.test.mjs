import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    copyEsbuildSidecar,
    esbuildPlatformBinaryRelativePath,
} from './esbuild-sidecar.mjs';
import {
    detectPlatformArch,
    esbuildSidecarFileName,
    getReleaseDownloadUrl,
    getVendorBinaryPath,
    installNativeBinary,
    isNativeBinaryInstalled,
    resolveEsbuildBinaryInNodeModules,
} from './native-binary.mjs';

describe('detectPlatformArch', () => {
    it('maps linux x64', () => {
        expect(detectPlatformArch('linux', 'x64')).toEqual({
            platform: 'linux',
            arch: 'x64',
            assetBase: 'lumpcode-linux-x64',
        });
    });

    it('maps darwin arm64', () => {
        expect(detectPlatformArch('darwin', 'arm64')).toEqual({
            platform: 'darwin',
            arch: 'arm64',
            assetBase: 'lumpcode-darwin-arm64',
        });
    });

    it('maps windows x64 with .exe suffix', () => {
        expect(detectPlatformArch('win32', 'x64')).toEqual({
            platform: 'windows',
            arch: 'x64',
            assetBase: 'lumpcode-windows-x64.exe',
        });
    });

    it('returns null for unsupported platform', () => {
        expect(detectPlatformArch('freebsd', 'x64')).toBeNull();
    });

    it('returns null for unsupported arch on windows', () => {
        expect(detectPlatformArch('win32', 'arm64')).toBeNull();
    });
});

describe('getReleaseDownloadUrl', () => {
    it('builds a versioned GitHub release URL', () => {
        expect(
            getReleaseDownloadUrl({
                version: '1.2.3',
                assetBase: 'lumpcode-linux-x64',
                repo: 'lumpcode/lumpcode',
            }),
        ).toBe('https://github.com/lumpcode/lumpcode/releases/download/v1.2.3/lumpcode-linux-x64');
    });

    it('preserves a v-prefixed version tag', () => {
        expect(
            getReleaseDownloadUrl({
                version: 'v2.0.0',
                assetBase: 'lumpcode-darwin-arm64',
                repo: 'YOUR_ORG/Lumpcode',
            }),
        ).toBe('https://github.com/YOUR_ORG/Lumpcode/releases/download/v2.0.0/lumpcode-darwin-arm64');
    });
});

describe('installNativeBinary', () => {
    /** @type {string[]} */
    const tempDirs = [];

    afterEach(async () => {
        for (const dir of tempDirs.splice(0)) {
            await fs.promises.rm(dir, { recursive: true, force: true });
        }
        vi.unstubAllGlobals();
    });

    function makePkgRoot({ platform = 'linux', arch = 'x64' } = {}) {
        const pkgRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lumpcode-npm-install-'));
        tempDirs.push(pkgRoot);
        fs.mkdirSync(path.join(pkgRoot, 'dist', 'schemas'), { recursive: true });
        fs.mkdirSync(path.join(pkgRoot, 'dist', 'presets', 'commands'), { recursive: true });
        fs.writeFileSync(path.join(pkgRoot, 'dist', 'schemas', 'lumpConfig.schema.json'), '{}');
        fs.writeFileSync(path.join(pkgRoot, 'dist', 'presets', 'commands', 'copilot.js'), 'export const command = () => null;');
        fs.writeFileSync(
            path.join(pkgRoot, 'package.json'),
            JSON.stringify({ name: 'lumpcode-test-root', version: '0.0.0' }),
        );

        const detected = detectPlatformArch(platform, arch);
        if (detected) {
            const esbuildPkg =
                detected.platform === 'windows'
                    ? `@esbuild/win32-${detected.arch}`
                    : `@esbuild/${detected.platform}-${detected.arch}`;
            const esbuildPkgDir = path.join(pkgRoot, 'node_modules', esbuildPkg);
            fs.mkdirSync(esbuildPkgDir, { recursive: true });
            fs.writeFileSync(
                path.join(esbuildPkgDir, 'package.json'),
                JSON.stringify({ name: esbuildPkg, version: '0.0.0' }),
            );
            const esbuildBinaryPath = path.join(
                esbuildPkgDir,
                esbuildPlatformBinaryRelativePath(platform),
            );
            fs.mkdirSync(path.dirname(esbuildBinaryPath), { recursive: true });
            fs.writeFileSync(esbuildBinaryPath, 'mock-esbuild-binary');
        }

        return pkgRoot;
    }

    it('returns not installed on HTTP 404 without throwing', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({ ok: false, status: 404 })),
        );

        const pkgRoot = makePkgRoot();
        const result = await installNativeBinary({
            pkgRoot,
            version: '1.0.0',
            platform: 'linux',
            arch: 'x64',
        });

        expect(result).toEqual({
            installed: false,
            reason: 'not-found',
            assetBase: 'lumpcode-linux-x64',
        });
        expect(isNativeBinaryInstalled(pkgRoot)).toBe(false);
    });

    it('installs vendor layout on successful download', async () => {
        const binaryBody = Buffer.from('mock-sea-binary');
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url) => {
                if (String(url).endsWith('.sha256')) {
                    return { ok: false, status: 404 };
                }
                return {
                    ok: true,
                    async arrayBuffer() {
                        return binaryBody.buffer.slice(binaryBody.byteOffset, binaryBody.byteOffset + binaryBody.byteLength);
                    },
                };
            }),
        );

        const pkgRoot = makePkgRoot();
        const result = await installNativeBinary({
            pkgRoot,
            version: '1.0.0',
            platform: 'linux',
            arch: 'x64',
        });

        expect(result).toEqual({ installed: true, assetBase: 'lumpcode-linux-x64' });
        expect(isNativeBinaryInstalled(pkgRoot)).toBe(true);
        expect(fs.readFileSync(getVendorBinaryPath(pkgRoot))).toEqual(binaryBody);
        expect(fs.existsSync(path.join(pkgRoot, 'vendor', 'schemas', 'lumpConfig.schema.json'))).toBe(true);
        expect(fs.existsSync(path.join(pkgRoot, 'vendor', 'presets', 'commands', 'copilot.js'))).toBe(true);
        expect(fs.existsSync(path.join(pkgRoot, 'vendor', esbuildSidecarFileName('linux')))).toBe(true);
        expect(fs.readFileSync(path.join(pkgRoot, 'vendor', '.installed'), 'utf-8')).toContain('lumpcode-linux-x64');
    });

    it('returns missing-esbuild-sidecar when platform esbuild binary is unavailable', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url) => {
                if (String(url).endsWith('.sha256')) {
                    return { ok: false, status: 404 };
                }
                return {
                    ok: true,
                    async arrayBuffer() {
                        return Buffer.from('mock-sea-binary').buffer;
                    },
                };
            }),
        );

        const pkgRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lumpcode-npm-install-'));
        tempDirs.push(pkgRoot);
        fs.mkdirSync(path.join(pkgRoot, 'dist', 'schemas'), { recursive: true });
        fs.mkdirSync(path.join(pkgRoot, 'dist', 'presets', 'commands'), { recursive: true });
        fs.writeFileSync(path.join(pkgRoot, 'dist', 'schemas', 'lumpConfig.schema.json'), '{}');
        fs.writeFileSync(path.join(pkgRoot, 'dist', 'presets', 'commands', 'copilot.js'), 'export const command = () => null;');

        const result = await installNativeBinary({
            pkgRoot,
            version: '1.0.0',
            platform: 'linux',
            arch: 'x64',
        });

        expect(result).toEqual({
            installed: false,
            reason: 'missing-esbuild-sidecar',
            assetBase: 'lumpcode-linux-x64',
        });
    });

    it('copyEsbuildSidecar copies from node_modules into destDir', () => {
        const pkgRoot = makePkgRoot({ platform: 'linux', arch: 'x64' });
        const destDir = path.join(pkgRoot, 'vendor');
        fs.mkdirSync(destDir, { recursive: true });

        expect(resolveEsbuildBinaryInNodeModules(pkgRoot, 'linux', 'x64')).toContain('@esbuild/linux-x64');
        expect(copyEsbuildSidecar({ pkgRoot, destDir, platform: 'linux', arch: 'x64' })).toBe(true);
        expect(fs.readFileSync(path.join(destDir, 'esbuild'), 'utf-8')).toBe('mock-esbuild-binary');
    });

    it('returns unsupported-platform without fetching', async () => {
        const fetchFn = vi.fn();
        vi.stubGlobal('fetch', fetchFn);

        const pkgRoot = makePkgRoot();
        const result = await installNativeBinary({
            pkgRoot,
            version: '1.0.0',
            platform: 'freebsd',
            arch: 'x64',
        });

        expect(result).toEqual({ installed: false, reason: 'unsupported-platform' });
        expect(fetchFn).not.toHaveBeenCalled();
    });
});
