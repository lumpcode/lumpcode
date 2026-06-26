import { type Failure, success, type Success } from '@lumpcode/core';

import type { LocalConfig } from '../../types/LocalConfig';
import type { Mode } from '../../types/Mode';
import type { WorkspaceStrategy } from '../../types/WorkspaceStrategy';
import { getProjectName } from '../getProjectName';
import { readLocalConfig } from '../readLocalConfig';
import { resolvePrimaryDiscoveryBranch } from '../resolveDiscoveryBranches';
import { runPreflight } from '../runPreflight';

export interface RunProjectPreflightInput {
    sourceProjectRoot: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    /** When set, skips reading `.lumpcode/local.json` (e.g. daemon frozen config at startup). */
    localConfig?: LocalConfig;
    /** Integration branch to pre-flight; defaults to primary project base branch. */
    targetBranch?: string;
}

export interface RunProjectPreflightOutput {
    /** Absolute path to the execution workspace (git repo root where lumps run). */
    executionWorkspacePath: string;
    projectBaseBranch: string;
    mode: Mode;
    workspaceStrategy: WorkspaceStrategy;
}

/**
 * Reads `.lumpcode/local.json`, resolves the project name, then runs the
 * workspace pre-flight. Returns the data the run loop needs to call
 * `runLumpFromJsConfig`.
 */
export async function runProjectPreflight(
    input: RunProjectPreflightInput,
): Promise<Success<RunProjectPreflightOutput> | Failure<string>> {
    const { sourceProjectRoot, localConfigFolderPath, globalConfigFolderPath, localConfig: providedLocalConfig } =
        input;

    let projectBaseBranch: string;
    let effectiveMode: Mode;
    let workspaceStrategy: WorkspaceStrategy;


    let finalLocalConfig: LocalConfig;

    if (providedLocalConfig) {
        finalLocalConfig = providedLocalConfig;
    } else {
        const localConfigResult = await readLocalConfig({ localConfigFolderPath });
        if (!localConfigResult.success) return localConfigResult;
        finalLocalConfig = localConfigResult.data;
    }

    projectBaseBranch = input.targetBranch ?? resolvePrimaryDiscoveryBranch(finalLocalConfig);
    effectiveMode = finalLocalConfig.mode;
    workspaceStrategy = finalLocalConfig.workspaceStrategy ?? 'checkout';

    const projectNameResult = await getProjectName({
        localConfigFolderPath,
        projectRoot: sourceProjectRoot,
    });
    if (!projectNameResult.success) return projectNameResult;

    const preflightResult = await runPreflight({
        mode: effectiveMode,
        projectBaseBranch,
        sourceProjectRoot,
        globalConfigFolderPath,
        projectName: projectNameResult.data,
    });
    if (!preflightResult.success) return preflightResult;

    return success({
        executionWorkspacePath: preflightResult.data.executionWorkspacePath,
        projectBaseBranch,
        mode: effectiveMode,
        workspaceStrategy,
    });
}
