import { failure, success, type Failure, type Success } from '@lumpcode/core';

import { resolveBundledAssetPath } from '../resolveBundledAssetPath';

import { installPresetCommands } from './installPresetCommands.mjs';

export { installPresetCommands, listBundledPresetCommandNames, resolveGlobalConfigFolderPath, resolveNpmBundlePresetsDir } from './installPresetCommands.mjs';

export async function ensurePresetCommandsInstalled({
    globalConfigFolderPath,
    bundlePresetsDir = resolveBundledAssetPath(__dirname, 'presets/commands', '../../presets/commands'),
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
