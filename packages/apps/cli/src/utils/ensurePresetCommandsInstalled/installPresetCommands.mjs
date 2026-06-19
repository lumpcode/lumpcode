import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * @param {string} [homeDir]
 * @returns {string}
 */
export function resolveGlobalConfigFolderPath(homeDir = os.homedir()) {
    return path.join(homeDir, '.lumpcode');
}

/**
 * @param {string} pkgRoot
 * @returns {string}
 */
export function resolveNpmBundlePresetsDir(pkgRoot) {
    return path.join(pkgRoot, 'dist', 'presets', 'commands');
}

/**
 * @param {string} bundlePresetsDir
 * @returns {Promise<string[]>}
 */
export async function listBundledPresetCommandNames(bundlePresetsDir) {
    const names = await fsp.readdir(bundlePresetsDir);
    return names.filter((name) => name.endsWith('.js')).sort();
}

/**
 * @param {string} bundlePresetsDir
 * @param {string} destDir
 * @param {boolean} overwrite
 */
async function installPresetUtilsFiles(bundlePresetsDir, destDir, overwrite) {
    const utilsDir = path.join(bundlePresetsDir, 'utils');
    if (!fs.existsSync(utilsDir)) {
        return;
    }

    const destUtilsDir = path.join(destDir, 'utils');
    await fsp.mkdir(destUtilsDir, { recursive: true });

    const utilsNames = (await fsp.readdir(utilsDir)).filter((name) => name.endsWith('.js'));
    for (const name of utilsNames) {
        const dest = path.join(destUtilsDir, name);
        if (!overwrite) {
            try {
                await fsp.access(dest);
                continue;
            } catch {
                // missing — copy from bundle
            }
        }
        await fsp.copyFile(path.join(utilsDir, name), dest);
    }
}

/**
 * @param {{
 *   bundlePresetsDir: string;
 *   globalConfigFolderPath: string;
 *   overwrite?: boolean;
 * }} input
 * @returns {Promise<{ installed: boolean; reason?: string; count?: number }>}
 */
export async function installPresetCommands({
    bundlePresetsDir,
    globalConfigFolderPath,
    overwrite = false,
}) {
    if (!fs.existsSync(bundlePresetsDir)) {
        return { installed: false, reason: 'missing-bundle-presets' };
    }

    const presetNames = await listBundledPresetCommandNames(bundlePresetsDir);
    if (presetNames.length === 0) {
        return { installed: false, reason: 'no-presets' };
    }

    const destDir = path.join(globalConfigFolderPath, 'commands', 'presets');
    await fsp.mkdir(destDir, { recursive: true });

    for (const name of presetNames) {
        const dest = path.join(destDir, name);
        if (!overwrite) {
            try {
                await fsp.access(dest);
                continue;
            } catch {
                // missing — copy from bundle
            }
        }
        await fsp.copyFile(path.join(bundlePresetsDir, name), dest);
    }

    await installPresetUtilsFiles(bundlePresetsDir, destDir, overwrite);

    return { installed: true, count: presetNames.length };
}
