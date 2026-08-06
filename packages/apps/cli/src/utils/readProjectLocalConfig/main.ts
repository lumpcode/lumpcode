import { failure, type Failure, success, type Success } from '@lumpcode/core';

import type { LocalJsonConfig } from '../../types/LocalJsonConfig';
import type { ProjectJsonConfig } from '../../types/ProjectJsonConfig';
import type { ResolvedProjectLocalConfig } from '../../types/ResolvedProjectLocalConfig';
import {
    formatZodIssues,
    resolvedProjectLocalConfigSchema,
} from '../projectLocalConfigSchema';
import { readLocalConfig } from '../readLocalConfig';
import { readProjectJson } from '../readProjectJson';

export { resolvedProjectLocalConfigSchema } from '../projectLocalConfigSchema';

const SHARED_KEYS = [
    'primaryBranch',
    'primaryBranches',
    'projectBaseBranch',
    'command',
    'maximumNumberOfConcurrentBranches',
    'keepHistory',
] as const satisfies ReadonlyArray<keyof ProjectJsonConfig & keyof LocalJsonConfig>;

/**
 * Per-key merge: local wins for every key present on both layers.
 * Keys only on one layer use that layer. `workspaceStrategy` defaults to `checkout`.
 */
export function mergeProjectAndLocalConfig(input: {
    project: ProjectJsonConfig;
    local: LocalJsonConfig;
}): Success<ResolvedProjectLocalConfig> | Failure<string> {
    const { project, local } = input;

    const merged: Record<string, unknown> = {
        projectName: project.projectName,
        mode: local.mode,
        workspaceStrategy: local.workspaceStrategy ?? 'checkout',
    };

    if (local.disabled !== undefined) merged.disabled = local.disabled;
    if (local.maxParallelRun !== undefined) merged.maxParallelRun = local.maxParallelRun;
    if (local.verbose !== undefined) merged.verbose = local.verbose;

    for (const key of SHARED_KEYS) {
        if (local[key] !== undefined) {
            merged[key] = local[key];
        } else if (project[key] !== undefined) {
            merged[key] = project[key];
        }
    }

    const validated = resolvedProjectLocalConfigSchema.safeParse(merged);
    if (!validated.success) {
        return failure(`Invalid merged project/local config: ${formatZodIssues(validated.error)}`);
    }

    return success(validated.data);
}

/**
 * Merge project.json + local.json (local wins), default workspaceStrategy,
 * validate resolved primary.
 */
export async function readProjectLocalConfig(input: {
    localConfigFolderPath: string;
}): Promise<Success<ResolvedProjectLocalConfig> | Failure<string>> {
    const projectResult = await readProjectJson({
        localConfigFolderPath: input.localConfigFolderPath,
    });
    if (!projectResult.success) {
        return projectResult;
    }

    const localResult = await readLocalConfig({
        localConfigFolderPath: input.localConfigFolderPath,
    });
    if (!localResult.success) {
        return localResult;
    }

    return mergeProjectAndLocalConfig({
        project: projectResult.data,
        local: localResult.data,
    });
}
