import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as z from 'zod';

import { execAsync, failure, nodeErrnoCode, success } from '@lumpcode/core';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import type { Mode } from '../../types/Mode';
import { commandFailure } from '../../utils/commandFailure';
import { resolveInferredProjectName } from '../../utils/getProjectName';
import { scaffoldLumpcodeProject } from '../../utils/scaffoldLumpcodeProject';

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

    const projectNameResolution = await resolveInferredProjectName({
        projectRoot,
        explicitName: input.options.projectName,
    });

    if (!projectNameResolution.success) return commandFailure(projectNameResolution.data);

    const projectName = projectNameResolution.data;

    const scaffoldResult = await scaffoldLumpcodeProject({
        projectRoot,
        project: {
            projectName,
            primaryBranch: input.options.primaryBranch?.trim() || DEFAULT_PRIMARY_BRANCH,
        },
        local: {
            mode: input.options.mode ?? DEFAULT_MODE,
        },
    });

    if (!scaffoldResult.success) return commandFailure(scaffoldResult.data);

    return success({
        messages: [`Initialized Lumpcode project "${projectName}" at ${scaffoldResult.data.lumpcodeDir}`],
        data: { projectRoot, projectName, lumpcodeDir: scaffoldResult.data.lumpcodeDir },
    });
};

export const command = {
    handlerMaker,
    name: 'project-setup',
    description: 'Initialize a new Lumpcode project in the given directory',
    inputSchema,
} satisfies Command;
