import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { failure, pathExists, success, type Failure, type Success } from '@lumpcode/core';

import type { Mode } from '../../types/Mode';
import type { WorkspaceStrategy } from '../../types/WorkspaceStrategy';
import { appendMissingGitignoreLines } from '../appendMissingGitignoreLines';
import { localConfigFolderPath } from '../localConfigFolderPath';
import { lumpsDirPath } from '../lumpDirPath';
import { projectJsonPath } from '../projectJsonPath';
import { LOCAL_CONFIG_FILE_NAME } from '../readLocalConfig';
import { writeJsonFile } from '../writeJsonFile';

export type ScaffoldLumpcodeProjectInput = {
    projectRoot: string;
    project: { projectName: string; primaryBranch: string };
    local: {
        mode: Mode;
        workspaceStrategy?: WorkspaceStrategy;
        maxParallelRun?: number;
    };
};

const CONTEXT_STATUS_RECORD_GITIGNORE_LINE = '.lumpcode/**/contextStatusRecord.json';
const HISTORY_GITIGNORE_LINE = '.lumpcode/**/history/';
const WORKTREES_GITIGNORE_LINE = '.lumpcode/worktrees/';
const CACHE_GITIGNORE_LINE = '.lumpcode/.cache/';
const LOCAL_CONFIG_GITIGNORE_LINE = `.lumpcode/${LOCAL_CONFIG_FILE_NAME}`;

/**
 * Create-only `.lumpcode/` write path. Fails when the tree already exists.
 */
export async function scaffoldLumpcodeProject(
    input: ScaffoldLumpcodeProjectInput,
): Promise<Success<{ lumpcodeDir: string }> | Failure<string>> {
    const lumpcodeDir = localConfigFolderPath({ projectRoot: input.projectRoot });
    const lumpcodeExists = await pathExists(lumpcodeDir);
    if (lumpcodeExists) {
        return failure(`A Lumpcode project already exists at ${lumpcodeDir}`);
    }

    const localConfig: {
        mode: Mode;
        workspaceStrategy?: WorkspaceStrategy;
        maxParallelRun?: number;
    } = { mode: input.local.mode };
    if (input.local.workspaceStrategy !== undefined) {
        localConfig.workspaceStrategy = input.local.workspaceStrategy;
    }
    if (input.local.maxParallelRun !== undefined && input.local.maxParallelRun !== 1) {
        localConfig.maxParallelRun = input.local.maxParallelRun;
    }

    try {
        await fs.mkdir(lumpcodeDir, { recursive: true });
        const [, , projectWrite, localWrite] = await Promise.all([
            fs.mkdir(lumpsDirPath({ localConfigFolderPath: lumpcodeDir })),
            fs.mkdir(path.join(lumpcodeDir, 'commands')),
            writeJsonFile({
                filePath: projectJsonPath({ localConfigFolderPath: lumpcodeDir }),
                data: input.project,
                pretty: true,
                trailingNewline: true,
            }),
            writeJsonFile({
                filePath: path.join(lumpcodeDir, LOCAL_CONFIG_FILE_NAME),
                data: localConfig,
                pretty: true,
                trailingNewline: true,
            }),
        ]);
        if (!projectWrite.success) throw new Error(projectWrite.data);
        if (!localWrite.success) throw new Error(localWrite.data);
    } catch (error) {
        return failure(`Failed to initialize Lumpcode project: ${error}`);
    }

    const gitignoreResult = await appendMissingGitignoreLines({
        projectRoot: input.projectRoot,
        lines: [
            CONTEXT_STATUS_RECORD_GITIGNORE_LINE,
            HISTORY_GITIGNORE_LINE,
            WORKTREES_GITIGNORE_LINE,
            CACHE_GITIGNORE_LINE,
            LOCAL_CONFIG_GITIGNORE_LINE,
        ],
    });
    if (!gitignoreResult.success) {
        return failure(gitignoreResult.data);
    }

    return success({ lumpcodeDir });
}
