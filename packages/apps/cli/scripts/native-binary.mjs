import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const DEFAULT_INSTALL_REPO = 'YOUR_ORG/Lumpcode';

/**
 * @param {string} [platform]
 * @param {string} [arch]
 * @returns {{ platform: string; arch: string; assetBase: string } | null}
 */
export function detectPlatformArch(platform = process.platform, arch = process.arch) {
    let archName;
    if (arch === 'arm64' || arch === 'aarch64') {
        archName = 'arm64';
    } else if (arch === 'x64' || arch === 'x86_64') {
        archName = 'x64';
    } else {
        return null;
    }

    let platformName;
    if (platform === 'linux') {
        platformName = 'linux';
    } else if (platform === 'darwin') {
        platformName = 'darwin';
    } else if (platform === 'win32') {
        platformName = 'windows';
    } else {
        return null;
    }

    if (platformName === 'windows' && archName !== 'x64') {
        return null;
    }

    const assetBase =
        platformName === 'windows'
            ? `lumpcode-${platformName}-${archName}.exe`
            : `lumpcode-${platformName}-${archName}`;

    return { platform: platformName, arch: archName, assetBase };
}

/**
 * @param {{ version: string; assetBase: string; repo?: string }} input
 * @returns {string}
 */
export function getReleaseDownloadUrl({ version, assetBase, repo = process.env.LUMPCODE_INSTALL_REPO || DEFAULT_INSTALL_REPO }) {
    const tag = version.startsWith('v') ? version : `v${version}`;
    return `https://github.com/${repo}/releases/download/${tag}/${assetBase}`;
}

/**
 * @param {string} pkgRoot
 * @returns {string}
 */
export function getVendorBinaryPath(pkgRoot) {
    return process.platform === 'win32'
        ? path.join(pkgRoot, 'vendor', 'lumpcode.exe')
        : path.join(pkgRoot, 'vendor', 'lumpcode');
}

/**
 * @param {string} pkgRoot
 * @returns {boolean}
 */
export function isNativeBinaryInstalled(pkgRoot) {
    const marker = path.join(pkgRoot, 'vendor', '.installed');
    const binary = getVendorBinaryPath(pkgRoot);
    return fs.existsSync(marker) && fs.existsSync(binary);
}

/**
 * @param {string} src
 * @param {string} dest
 */
function copyDirRecursive(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    fs.cpSync(src, dest, { recursive: true });
}

/**
 * @param {string} platform
 * @returns {string}
 */
export function esbuildSidecarFileName(platform = process.platform) {
    return platform === 'win32' ? 'esbuild.exe' : 'esbuild';
}

/**
 * @param {string} pkgRoot
 * @param {string} platform
 * @param {string} arch
 * @returns {string | null}
 */
export function resolveEsbuildBinaryInNodeModules(
    pkgRoot,
    platform = process.platform,
    arch = process.arch,
) {
    const detected = detectPlatformArch(platform, arch);
    if (!detected) {
        return null;
    }

    const { platform: platformName, arch: archName } = detected;
    const esbuildPkg =
        platformName === 'windows'
            ? `@esbuild/win32-${archName}`
            : `@esbuild/${platformName}-${archName}`;
    const binaryName = esbuildSidecarFileName(platform);

    const searchRoots = [
        pkgRoot,
        path.join(pkgRoot, '..', '..'),
        path.join(pkgRoot, '..', '..', '..'),
    ];

    for (const root of searchRoots) {
        const candidate = path.join(root, 'node_modules', esbuildPkg, 'bin', binaryName);
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    return null;
}

/**
 * @param {{ pkgRoot: string; destDir: string; platform?: string; arch?: string }} input
 * @returns {boolean}
 */
export function copyEsbuildSidecar({
    pkgRoot,
    destDir,
    platform = process.platform,
    arch = process.arch,
}) {
    const sourcePath = resolveEsbuildBinaryInNodeModules(pkgRoot, platform, arch);
    if (!sourcePath) {
        return false;
    }

    const destPath = path.join(destDir, esbuildSidecarFileName(platform));
    fs.copyFileSync(sourcePath, destPath);
    if (platform !== 'win32') {
        fs.chmodSync(destPath, 0o755);
    }

    return true;
}

/**
 * @param {string} data
 * @param {string} expectedHex
 * @returns {boolean}
 */
function verifySha256(data, expectedHex) {
    const actual = crypto.createHash('sha256').update(data).digest('hex');
    return actual === expectedHex.trim().toLowerCase();
}

/**
 * @param {string} url
 * @param {typeof fetch} fetchFn
 * @returns {Promise<{ ok: true; buffer: Buffer } | { ok: false; status?: number; error?: string }>}
 */
async function downloadUrl(url, fetchFn) {
    try {
        const response = await fetchFn(url);
        if (!response.ok) {
            return { ok: false, status: response.status };
        }
        const arrayBuffer = await response.arrayBuffer();
        return { ok: true, buffer: Buffer.from(arrayBuffer) };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, error: message };
    }
}

/**
 * @param {{
 *   pkgRoot: string;
 *   version: string;
 *   platform?: string;
 *   arch?: string;
 *   fetchFn?: typeof fetch;
 * }} input
 * @returns {Promise<{ installed: boolean; reason?: string; assetBase?: string }>}
 */
export async function installNativeBinary({
    pkgRoot,
    version,
    platform = process.platform,
    arch = process.arch,
    fetchFn = fetch,
}) {
    const detected = detectPlatformArch(platform, arch);
    if (!detected) {
        return { installed: false, reason: 'unsupported-platform' };
    }

    const { assetBase } = detected;
    const url = getReleaseDownloadUrl({ version, assetBase });
    const download = await downloadUrl(url, fetchFn);
    if (!download.ok) {
        return {
            installed: false,
            reason: download.status === 404 ? 'not-found' : 'download-failed',
            assetBase,
        };
    }

    const checksumUrl = `${url}.sha256`;
    const checksumDownload = await downloadUrl(checksumUrl, fetchFn);
    if (checksumDownload.ok) {
        const expectedHex = checksumDownload.buffer.toString('utf-8').split(/\s+/)[0];
        if (!verifySha256(download.buffer, expectedHex)) {
            return { installed: false, reason: 'checksum-mismatch', assetBase };
        }
    }

    const vendorDir = path.join(pkgRoot, 'vendor');
    const binaryPath = getVendorBinaryPath(pkgRoot);
    const schemasSrc = path.join(pkgRoot, 'dist', 'schemas');
    const presetsSrc = path.join(pkgRoot, 'dist', 'presets');

    if (!fs.existsSync(schemasSrc) || !fs.existsSync(presetsSrc)) {
        return { installed: false, reason: 'missing-dist-sidecars', assetBase };
    }

    fs.mkdirSync(vendorDir, { recursive: true });
    fs.writeFileSync(binaryPath, download.buffer);
    if (platform !== 'win32') {
        fs.chmodSync(binaryPath, 0o755);
    }

    copyDirRecursive(schemasSrc, path.join(vendorDir, 'schemas'));
    copyDirRecursive(presetsSrc, path.join(vendorDir, 'presets'));

    const esbuildCopied = copyEsbuildSidecar({ pkgRoot, destDir: vendorDir, platform, arch });
    if (!esbuildCopied) {
        return { installed: false, reason: 'missing-esbuild-sidecar', assetBase };
    }

    const marker = {
        version,
        assetBase,
        installedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(vendorDir, '.installed'), `${JSON.stringify(marker)}\n`, 'utf-8');

    return { installed: true, assetBase };
}
