import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @param {string} platform
 * @returns {string}
 */
export function esbuildSidecarFileName(platform = process.platform) {
    return platform === 'win32' || platform === 'windows' ? 'esbuild.exe' : 'esbuild';
}

/**
 * Relative path to the platform binary inside an @esbuild/* package (matches esbuild install.js).
 * @param {string} platform
 * @returns {string}
 */
export function esbuildPlatformBinaryRelativePath(platform = process.platform) {
    return platform === 'win32' || platform === 'windows' ? 'esbuild.exe' : path.join('bin', 'esbuild');
}

/**
 * @param {string} platform
 * @param {string} arch
 * @returns {string | null}
 */
export function esbuildPlatformPackageName(platform, arch) {
    let archName;
    if (arch === 'arm64' || arch === 'aarch64') {
        archName = 'arm64';
    } else if (arch === 'x64' || arch === 'x86_64') {
        archName = 'x64';
    } else if (arch === 'ia32' || arch === 'x86') {
        archName = 'ia32';
    } else {
        return null;
    }

    if (platform === 'win32' || platform === 'windows') {
        return `@esbuild/win32-${archName}`;
    }
    if (platform === 'linux' || platform === 'darwin') {
        return `@esbuild/${platform}-${archName}`;
    }

    return null;
}

/**
 * @param {{ pkgRoot: string; platform?: string; arch?: string }} input
 * @returns {string | null}
 */
export function resolveEsbuildBinaryPath({
    pkgRoot,
    platform = process.platform,
    arch = process.arch,
}) {
    const esbuildPkg = esbuildPlatformPackageName(platform, arch);
    if (!esbuildPkg) {
        return null;
    }

    const pkgJsonPath = path.join(pkgRoot, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) {
        return null;
    }

    try {
        const require = createRequire(pkgJsonPath);
        const resolvedPkg = require.resolve(`${esbuildPkg}/package.json`);
        const candidate = path.join(
            path.dirname(resolvedPkg),
            esbuildPlatformBinaryRelativePath(platform),
        );
        return fs.existsSync(candidate) ? candidate : null;
    } catch {
        return null;
    }
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
    const sourcePath = resolveEsbuildBinaryPath({ pkgRoot, platform, arch });
    if (!sourcePath) {
        return false;
    }

    const destPath = path.join(destDir, esbuildSidecarFileName(platform));
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(sourcePath, destPath);
    if (platform !== 'win32' && platform !== 'windows') {
        fs.chmodSync(destPath, 0o755);
    }

    return true;
}

function parseCliArgs(argv) {
    /** @type {{ destDir: string | null; pkgRoot: string | null; platform: string | undefined; arch: string | undefined }} */
    const parsed = {
        destDir: null,
        pkgRoot: null,
        platform: undefined,
        arch: undefined,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--platform') {
            parsed.platform = argv[index + 1];
            index += 1;
            continue;
        }
        if (arg === '--arch') {
            parsed.arch = argv[index + 1];
            index += 1;
            continue;
        }
        if (arg === '--pkg-root') {
            parsed.pkgRoot = argv[index + 1];
            index += 1;
            continue;
        }
        if (!parsed.destDir) {
            parsed.destDir = arg;
        }
    }

    return parsed;
}

function runCli() {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const defaultPkgRoot = path.join(scriptDir, '..');
    const { destDir, pkgRoot, platform, arch } = parseCliArgs(process.argv.slice(2));

    if (!destDir) {
        console.error('Usage: node esbuild-sidecar.mjs <destDir> [--pkg-root <path>] [--platform <name>] [--arch <name>]');
        process.exit(1);
    }

    const copied = copyEsbuildSidecar({
        pkgRoot: path.resolve(pkgRoot ?? defaultPkgRoot),
        destDir: path.resolve(destDir),
        platform,
        arch,
    });

    if (!copied) {
        const esbuildPkg = esbuildPlatformPackageName(
            platform ?? process.platform,
            arch ?? process.arch,
        );
        console.error(`esbuild platform binary not found for ${esbuildPkg ?? 'unknown platform'}`);
        process.exit(1);
    }
}

const isCli = process.argv[1] === fileURLToPath(import.meta.url);

if (isCli) {
    runCli();
}
