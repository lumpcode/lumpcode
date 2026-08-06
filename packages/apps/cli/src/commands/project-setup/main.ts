import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as z from 'zod';

import { execAsync, failure, nodeErrnoCode, pathExists, success, Success, Failure } from '@lumpcode/core';

import { appendMissingGitignoreLines } from '../../utils/appendMissingGitignoreLines';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import type { Mode } from '../../types/Mode';
import type { ProjectConfig } from '../../types/ProjectConfig';
import { commandFailure } from '../../utils/commandFailure';
import {
    isValidProjectName,
    rawRepoSegmentFromRemoteUrl,
    sanitizeInferredProjectName,
} from '../../utils/getProjectName';
import { localConfigFolderPath } from '../../utils/localConfigFolderPath';
import { lumpsDirPath } from '../../utils/lumpDirPath';
import { projectJsonPath } from '../../utils/projectJsonPath';
import { LOCAL_CONFIG_FILE_NAME } from '../../utils/readLocalConfig';
import { writeJsonFile } from '../../utils/writeJsonFile';

const DEFAULT_MODE: Mode = 'shared';
const DEFAULT_PRIMARY_BRANCH = 'main';

const inputSchema = z.object({
    options: baseCommandOptionsSchema.extend({
        projectPath: z.string().optional().describe('Path to the project root directory'),
        projectName: z
            .string()
            .optional()
            .describe('Project name: letters, digits, underscores, and hyphens only'),
        mode: z
            .enum(['shared', 'dedicated'])
            .optional()
            .describe('Initial `mode` written to .lumpcode/local.json (default: shared). Use `dedicated` on a daemon machine.'),
        primaryBranch: z
            .string()
            .optional()
            .describe('Initial `primaryBranch` written to .lumpcode/project.json (default: main)'),
    }),
    arguments: z.object({}),
});

export type Input = z.infer<typeof inputSchema>;

export type Output = {
    messages: string[];
    data?: { projectRoot: string; projectName: string; lumpcodeDir: string };
};

export interface Injections {}

async function resolveProjectName(input: {
    projectRoot: string;
    explicitName: string | undefined;
}): Promise<Success<string> | Failure<string>> {
    const trimmed = input.explicitName?.trim();
    if (trimmed) {
        if (!isValidProjectName(trimmed)) {
            return failure(
                'projectName must contain only letters, digits, underscores (_), and hyphens (-). Spaces and other characters are not allowed.',
            );
        }
        return success(trimmed);
    }

    const remoteResult = await execAsync('git remote get-url origin', { cwd: input.projectRoot });
    let raw: string | undefined;
    if (remoteResult.success && remoteResult.data.stdout.trim() !== '') {
        raw = rawRepoSegmentFromRemoteUrl(remoteResult.data.stdout);
    }
    if (!raw) {
        raw = path.basename(path.resolve(input.projectRoot));
    }

    const sanitized = sanitizeInferredProjectName(raw);
    if (!sanitized || !isValidProjectName(sanitized)) {
        return failure(
            'Could not derive a valid projectName from the git remote or directory name. Pass --projectName with only letters, digits, underscores, and hyphens.',
        );
    }
    return success(sanitized);
}

const CONTEXT_STATUS_RECORD_GITIGNORE_LINE = '.lumpcode/**/contextStatusRecord.json';
const HISTORY_GITIGNORE_LINE = '.lumpcode/**/history/';
const WORKTREES_GITIGNORE_LINE = '.lumpcode/worktrees/';
const CACHE_GITIGNORE_LINE = '.lumpcode/.cache/';
const LOCAL_CONFIG_GITIGNORE_LINE = `.lumpcode/${LOCAL_CONFIG_FILE_NAME}`;

const handlerMaker: CommandHandlerMaker<Injections, Input, Output> = () => async (input) => {
    const projectPathOpt = input.options.projectPath?.trim();
    const projectRoot = path.resolve(process.cwd(), projectPathOpt && projectPathOpt !== '' ? projectPathOpt : '.');

    let stat;
    try {
        stat = await fs.stat(projectRoot);
    } catch (error: unknown) {
        const code = nodeErrnoCode(error);
        if (code === 'ENOENT') {
            return failure({ messages: [`Project path does not exist: ${projectRoot}`] });
        }
        return failure({ messages: [`Cannot read project path ${projectRoot}: ${String(error)}`] });
    }

    if (!stat.isDirectory()) {
        return failure({ messages: [`Project path is not a directory: ${projectRoot}`] });
    }

    const gitCheck = await execAsync('git rev-parse --is-inside-work-tree', { cwd: projectRoot });
    if (!gitCheck.success || gitCheck.data.stdout.trim() !== 'true') {
        return failure({
            messages: [`Not a git repository (expected a working tree at ${projectRoot})`],
        });
    }

    const lumpcodeDir = localConfigFolderPath({ projectRoot });
    const lumpcodeExists = await pathExists(lumpcodeDir);
    if (lumpcodeExists) {
        return failure({
            messages: [`A Lumpcode project already exists at ${lumpcodeDir}`],
        });
    }

    const projectNameResolution = await resolveProjectName({
        projectRoot,
        explicitName: input.options.projectName,
    });

    if (!projectNameResolution.success) return commandFailure(projectNameResolution.data);

    const projectName = projectNameResolution.data;

    const projectConfig: ProjectConfig = {
        projectName,
        primaryBranch: input.options.primaryBranch?.trim() || DEFAULT_PRIMARY_BRANCH,
    };

    const localConfig = {
        mode: input.options.mode ?? DEFAULT_MODE,
    };

    try {
        await fs.mkdir(lumpcodeDir, { recursive: true });
        const [, , projectWrite, localWrite] = await Promise.all([
            fs.mkdir(lumpsDirPath({ localConfigFolderPath: lumpcodeDir })),
            fs.mkdir(path.join(lumpcodeDir, 'commands')),
            writeJsonFile({
                filePath: projectJsonPath({ localConfigFolderPath: lumpcodeDir }),
                data: projectConfig, pretty: true, trailingNewline: true,
            }),
            writeJsonFile({
                filePath: path.join(lumpcodeDir, LOCAL_CONFIG_FILE_NAME),
                data: localConfig, pretty: true, trailingNewline: true,
            }),
        ]);
        if (!projectWrite.success) throw new Error(projectWrite.data);
        if (!localWrite.success) throw new Error(localWrite.data);
    }
    catch (error) {
        return failure({
            messages: [`Failed to initialize Lumpcode project: ${error}`],
        });
    }

    const gitignoreResult = await appendMissingGitignoreLines({
        projectRoot,
        lines: [
            CONTEXT_STATUS_RECORD_GITIGNORE_LINE,
            HISTORY_GITIGNORE_LINE,
            WORKTREES_GITIGNORE_LINE,
            CACHE_GITIGNORE_LINE,
            LOCAL_CONFIG_GITIGNORE_LINE,
        ],
    });
    if (!gitignoreResult.success) {
        return failure({ messages: [gitignoreResult.data] });
    }

    return success({
        messages: [`Initialized Lumpcode project "${projectName}" at ${lumpcodeDir}`],
        data: { projectRoot, projectName, lumpcodeDir },
    });
};

export const command = {
    handlerMaker,
    name: 'project-setup',
    description: 'Initialize a new Lumpcode project in the given directory',
    inputSchema,
} satisfies Command;
