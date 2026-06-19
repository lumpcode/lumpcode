import * as fs from 'node:fs';
import * as path from 'node:path';
import { isSea } from 'node:sea';

import { failure, success, type Failure, type Success } from '@lumpcode/core';

import { installPresetCommands } from './installPresetCommands.mjs';

export { installPresetCommands, listBundledPresetCommandNames, resolveGlobalConfigFolderPath, resolveNpmBundlePresetsDir } from './installPresetCommands.mjs';

function resolveBundlePresetsDirPath(): string {
    if (isSea()) {
        return path.join(path.dirname(process.execPath), 'presets', 'commands');
    }
    const bundled = path.join(__dirname, 'presets', 'commands');
    if (fs.existsSync(bundled)) return bundled;
    return path.join(__dirname, '../../presets/commands');
}

export async function ensurePresetCommandsInstalled({
    globalConfigFolderPath,
    bundlePresetsDir = resolveBundlePresetsDirPath(),
    overwrite = false,
}: {
    globalConfigFolderPath: string;
    bundlePresetsDir?: string;
    overwrite?: boolean;
}): Promise<Success<void> | Failure<string>> {
    try {
        const result = await installPresetCommands({
            bundlePresetsDir,
            globalConfigFolderPath,
            overwrite,
        });

        if (!result.installed) {
            return failure(`Failed to install preset command modules: ${result.reason ?? 'unknown'}`);
        }

        return success(undefined);
    } catch (error) {
        return failure(`Failed to install preset command modules: ${error}`);
    }
}
