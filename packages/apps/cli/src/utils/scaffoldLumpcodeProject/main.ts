import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { failure, pathExists, success, type Failure, type Success } from '@lumpcode/core';

import type { Mode } from '../../types/Mode';
import type { WorkspaceStrategy } from '../../types/WorkspaceStrategy';
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

/** `.lumpcode/.gitignore` body. Written once by setup and project-setup. */
export const LUMPCODE_GITIGNORE_BODY = `# This file is written once.

/local.json
/.cache/
/worktrees/
**/contextStatusRecord.json
**/history/
**/transcripts/
`;

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
            fs.writeFile(path.join(lumpcodeDir, '.gitignore'), LUMPCODE_GITIGNORE_BODY, 'utf-8'),
        ]);
        if (!projectWrite.success) throw new Error(projectWrite.data);
        if (!localWrite.success) throw new Error(localWrite.data);
    } catch (error) {
        return failure(`Failed to initialize Lumpcode project: ${error}`);
    }

    return success({ lumpcodeDir });
}
