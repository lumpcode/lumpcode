import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as z from 'zod';

import { execAsync, Failure, failure, Success, success } from '@lumpcode/core';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import type { LocalConfig } from '../../types/LocalConfig';
import type { Mode } from '../../types/Mode';
import type { ProjectConfig } from '../../types/ProjectConfig';
import { unwrapOrCommandFailure } from '../../utils/commandFailure';
import {
    isValidProjectName,
    rawRepoSegmentFromRemoteUrl,
    sanitizeInferredProjectName,
} from '../../utils/getProjectName';
import { localConfigFolderPath } from '../../utils/localConfigFolderPath';
import { lumpsDirPath } from '../../utils/lumpDirPath';
import { projectJsonPath } from '../../utils/projectJsonPath';
import { LOCAL_CONFIG_FILE_NAME } from '../../utils/readLocalConfig';

const DEFAULT_MODE: Mode = 'shared';
const DEFAULT_PROJECT_BASE_BRANCH = 'main';

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
        projectBaseBranch: z
            .string()
            .optional()
            .describe('Initial `projectBaseBranch` written to .lumpcode/local.json (default: main)'),
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

async function ensureGitignoreLines({
    projectRoot,
    lines,
}: {
    projectRoot: string;
    lines: string[];
}): Promise<Success<void> | Failure<string>> {
    const gitignorePath = path.join(projectRoot, '.gitignore');
    let content = '';
    try {
        content = await fs.readFile(gitignorePath, 'utf-8');
    } catch (error: unknown) {
        const code =
            error && typeof error === 'object' && 'code' in error
                ? (error as NodeJS.ErrnoException).code
                : undefined;
        if (code !== 'ENOENT') {
            return failure(`Cannot read .gitignore: ${String(error)}`);
        }
    }

    const existingLines = new Set(content.split(/\r?\n/).map((line) => line.trim()));
    const missing = lines.filter((line) => !existingLines.has(line));
    if (missing.length === 0) {
        return success(undefined);
    }

    const prefix = content.length === 0 ? '' : content.endsWith('\n') ? '' : '\n';
    const addition = `${prefix}${missing.join('\n')}\n`;

    try {
        await fs.appendFile(gitignorePath, addition, 'utf-8');
    } catch (error: unknown) {
        return failure(`Cannot update .gitignore: ${String(error)}`);
    }
    return success(undefined);
}

const handlerMaker: CommandHandlerMaker<Injections, Input, Output> = () => async (input) => {
    const projectPathOpt = input.options.projectPath?.trim();
    const projectRoot = path.resolve(process.cwd(), projectPathOpt && projectPathOpt !== '' ? projectPathOpt : '.');

    let stat;
    try {
        stat = await fs.stat(projectRoot);
    } catch (error: unknown) {
        const code =
            error && typeof error === 'object' && 'code' in error
                ? (error as NodeJS.ErrnoException).code
                : undefined;
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
    const lumpcodeExists = await fs.access(lumpcodeDir).then(() => true).catch(() => false);
    if (lumpcodeExists) {
        return failure({
            messages: [`A Lumpcode project already exists at ${lumpcodeDir}`],
        });
    }

    const projectNameResolution = await unwrapOrCommandFailure(
        await resolveProjectName({
            projectRoot,
            explicitName: input.options.projectName,
        }),
    );
    if (!projectNameResolution.success) return projectNameResolution;

    const projectName = projectNameResolution.data;

    const projectConfig: ProjectConfig = {
        projectName,
    };

    const localConfig: LocalConfig = {
        mode: input.options.mode ?? DEFAULT_MODE,
        projectBaseBranch: input.options.projectBaseBranch?.trim() || DEFAULT_PROJECT_BASE_BRANCH,
        workspaceStrategy: 'checkout',
    };

    try {
        await fs.mkdir(lumpcodeDir, { recursive: true });
        await Promise.all([
            fs.mkdir(lumpsDirPath({ localConfigFolderPath: lumpcodeDir })),
            fs.mkdir(path.join(lumpcodeDir, 'commands')),
            fs.writeFile(
                projectJsonPath({ localConfigFolderPath: lumpcodeDir }),
                `${JSON.stringify(projectConfig, null, 2)}\n`,
                'utf-8',
            ),
            fs.writeFile(
                path.join(lumpcodeDir, LOCAL_CONFIG_FILE_NAME),
                `${JSON.stringify(localConfig, null, 2)}\n`,
                'utf-8',
            ),
        ]);
    }
    catch (error) {
        return failure({
            messages: [`Failed to initialize Lumpcode project: ${error}`],
        });
    }

    const gitignoreResult = await ensureGitignoreLines({
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
