import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    detectPlatformArch,
    getReleaseDownloadUrl,
    getVendorBinaryPath,
    installNativeBinary,
    isNativeBinaryInstalled,
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

    function makePkgRoot() {
        const pkgRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lumpcode-npm-install-'));
        tempDirs.push(pkgRoot);
        fs.mkdirSync(path.join(pkgRoot, 'dist', 'schemas'), { recursive: true });
        fs.mkdirSync(path.join(pkgRoot, 'dist', 'presets', 'commands'), { recursive: true });
        fs.writeFileSync(path.join(pkgRoot, 'dist', 'schemas', 'lumpConfig.schema.json'), '{}');
        fs.writeFileSync(path.join(pkgRoot, 'dist', 'presets', 'commands', 'copilot.js'), 'export const command = () => null;');
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
        expect(fs.readFileSync(path.join(pkgRoot, 'vendor', '.installed'), 'utf-8')).toContain('lumpcode-linux-x64');
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
