import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { execAsync, failure, type Failure, success, type Success } from '@lumpcode/core';

import type { Mode } from '../../types/Mode';
import { getExecutionWorkspacePath } from '../getExecutionWorkspacePath';
import { projectCopiesRootPath } from '../projectCopiesRootPath';

export interface RunPreflightInput {
    mode: Mode;
    projectBaseBranch: string;
    /** Absolute path to the directory that contains `.lumpcode/` (and `.git/`). */
    sourceProjectRoot: string;
    /** Used for `<globalConfigFolderPath>/project-copies/<projectName>` in `shared` mode. */
    globalConfigFolderPath: string;
    projectName: string;
}

export interface RunPreflightOutput {
    /**
     * Absolute path to the execution workspace (git repo root where lumps run).
     * Equal to `sourceProjectRoot` in `dedicated` mode; the project copy in `shared` mode.
     */
    executionWorkspacePath: string;
}

/**
 * Prepares the execution workspace before a lump is run. In `shared` mode, ensures a
 * project copy exists under `<globalConfigFolderPath>/project-copies/<projectName>`
 * and pulls `projectBaseBranch` inside it; the source clone is never touched.
 * In `dedicated` mode, pulls `projectBaseBranch` in `sourceProjectRoot` in
 * place (destructive: `git reset --hard origin/<projectBaseBranch>` wipes any
 * uncommitted work).
 *
 * The recovery path for crashed lumps relies on this pre-flight: a lump that
 * dies mid-run leaves the workspace on its branch, and the next pre-flight
 * resets back to `projectBaseBranch`. Keep the reset destructive.
 */
export async function runPreflight(input: RunPreflightInput): Promise<Success<RunPreflightOutput> | Failure<string>> {
    const { mode, projectBaseBranch, sourceProjectRoot, globalConfigFolderPath, projectName } = input;

    let executionWorkspacePath: string;
    if (mode === 'shared') {
        const copyResult = await ensureProjectCopy({ sourceProjectRoot, globalConfigFolderPath, projectName });
        if (!copyResult.success) return copyResult;
        executionWorkspacePath = copyResult.data;
    } else {
        executionWorkspacePath = sourceProjectRoot;
    }

    const pullResult = await pullProjectBaseBranch({ executionWorkspacePath, projectBaseBranch });
    if (!pullResult.success) return pullResult;

    return success({ executionWorkspacePath });
}

async function ensureProjectCopy({
    sourceProjectRoot,
    globalConfigFolderPath,
    projectName,
}: {
    sourceProjectRoot: string;
    globalConfigFolderPath: string;
    projectName: string;
}): Promise<Success<string> | Failure<string>> {
    const copiesRoot = projectCopiesRootPath({ globalConfigFolderPath });
    const copyPath = getExecutionWorkspacePath({
        mode: 'shared',
        sourceProjectRoot,
        globalConfigFolderPath,
        projectName,
    });

    await fs.mkdir(copiesRoot, { recursive: true });

    let stat: Awaited<ReturnType<typeof fs.stat>> | null = null;
    try {
        stat = await fs.stat(copyPath);
    } catch {
        stat = null;
    }

    if (!stat) {
        try {
            await fs.cp(sourceProjectRoot, copyPath, { recursive: true });
        } catch (error) {
            return failure(`Failed to create project copy at ${copyPath}: ${String(error)}`);
        }
        return success(path.resolve(copyPath));
    }

    if (!stat.isDirectory()) {
        return failure(`Project copy path exists but is not a directory: ${copyPath}`);
    }

    return success(path.resolve(copyPath));
}

async function pullProjectBaseBranch({
    executionWorkspacePath,
    projectBaseBranch,
}: {
    executionWorkspacePath: string;
    projectBaseBranch: string;
}): Promise<Success<void> | Failure<string>> {
    const commands = [
        'git fetch --all',
        `git switch ${projectBaseBranch}`,
        `git reset --hard origin/${projectBaseBranch}`,
        `git pull origin ${projectBaseBranch}`,
    ];

    for (const command of commands) {
        const result = await execAsync(command, { cwd: executionWorkspacePath });
        if (!result.success) {
            return failure(
                `Pre-flight failed while running "${command}" in ${executionWorkspacePath}: ${result.data.message}`,
            );
        }
    }

    return success(undefined);
}
