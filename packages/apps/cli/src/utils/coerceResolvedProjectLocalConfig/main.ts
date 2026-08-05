import { type Failure, type Success, success } from '@lumpcode/core';

import type { LocalConfig } from '../../types/LocalConfig';
import type { ResolvedProjectLocalConfig } from '../../types/ResolvedProjectLocalConfig';
import { mergeProjectAndLocalConfig, readProjectLocalConfig } from '../readProjectLocalConfig';
import { readProjectJson } from '../readProjectJson';

function isResolvedProjectLocalConfig(
    value: LocalConfig | ResolvedProjectLocalConfig,
): value is ResolvedProjectLocalConfig {
    return typeof (value as ResolvedProjectLocalConfig).projectName === 'string';
}

/**
 * Resolve the merged project+local surface.
 * - No provided config → `readProjectLocalConfig`
 * - Provided already-resolved (has `projectName`) → use as-is (daemon freeze)
 * - Provided local-only → merge with current `project.json` (local layer not re-read from disk)
 */
export async function coerceResolvedProjectLocalConfig(input: {
    localConfigFolderPath: string;
    localConfig?: LocalConfig | ResolvedProjectLocalConfig;
}): Promise<Success<ResolvedProjectLocalConfig> | Failure<string>> {
    const { localConfigFolderPath, localConfig: provided } = input;

    if (provided && isResolvedProjectLocalConfig(provided)) {
        return success(provided);
    }

    if (provided) {
        const projectResult = await readProjectJson({ localConfigFolderPath });
        if (!projectResult.success) {
            return projectResult;
        }
        return mergeProjectAndLocalConfig({
            project: projectResult.data,
            local: provided,
        });
    }

    return readProjectLocalConfig({ localConfigFolderPath });
}
