import { type Failure, success, type Success } from '@lumpcode/core';

import type { LocalConfig } from '../../types/LocalConfig';
import type { Mode } from '../../types/Mode';
import type { ResolvedProjectLocalConfig } from '../../types/ResolvedProjectLocalConfig';
import type { WorkspaceStrategy } from '../../types/WorkspaceStrategy';
import { coerceResolvedProjectLocalConfig } from '../coerceResolvedProjectLocalConfig';
import { resolvePrimaryBranch } from '../resolvePrimaryBranches';
import { runPreflight, type RunPreflightGitLock } from '../runPreflight';

export interface RunProjectPreflightInput {
    sourceProjectRoot: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    /** When set, skips re-reading local.json (e.g. daemon frozen config at startup). */
    localConfig?: LocalConfig | ResolvedProjectLocalConfig;
    /** Integration branch to pre-flight; defaults to primary project base branch. */
    targetBranch?: string;
    /** When set, preflight git mutations use the git-common-dir lock. */
    gitLock?: RunPreflightGitLock;
}

export interface RunProjectPreflightOutput {
    /** Absolute path to the execution workspace (git repo root where lumps run). */
    executionWorkspacePath: string;
    projectBaseBranch: string;
    mode: Mode;
    workspaceStrategy: WorkspaceStrategy;
}

/**
 * Reads merged project+local config, then runs the workspace pre-flight.
 * Returns the data the run loop needs to call `runLumpFromJsConfig`.
 */
export async function runProjectPreflight(
    input: RunProjectPreflightInput,
): Promise<Success<RunProjectPreflightOutput> | Failure<string>> {
    const { sourceProjectRoot, localConfigFolderPath, globalConfigFolderPath, localConfig: providedLocalConfig } =
        input;

    const resolvedResult = await coerceResolvedProjectLocalConfig({
        localConfigFolderPath,
        localConfig: providedLocalConfig,
    });
    if (!resolvedResult.success) return resolvedResult;
    const finalLocalConfig = resolvedResult.data;

    const projectBaseBranch = input.targetBranch ?? resolvePrimaryBranch(finalLocalConfig);
    const effectiveMode = finalLocalConfig.mode;
    const workspaceStrategy = finalLocalConfig.workspaceStrategy;

    const preflightResult = await runPreflight({
        mode: effectiveMode,
        projectBaseBranch,
        sourceProjectRoot,
        globalConfigFolderPath,
        projectName: finalLocalConfig.projectName,
        gitLock: input.gitLock,
    });
    if (!preflightResult.success) return preflightResult;

    return success({
        executionWorkspacePath: preflightResult.data.executionWorkspacePath,
        projectBaseBranch,
        mode: effectiveMode,
        workspaceStrategy,
    });
}
