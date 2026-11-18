import { access } from 'node:fs/promises';
import { spawn as nodeSpawn } from 'node:child_process';
import * as z from 'zod';

import { failure, success } from '@lumpcode/core';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import { DEFAULT_TAIL_LINES, getProjectName, supervisorLogPath, tailFile } from '../../utils';
import { commandFailure } from '../../utils/commandFailure';
import { validateCurrentLumpProjectRoot } from '../../utils/validateCurrentLumpProjectRoot';

const inputSchema = z.object({
    options: baseCommandOptionsSchema.extend({
        lines: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe('Number of initial lines to show (omitted = 10; 0 = whole file)'),
        noFollow: z.boolean().optional().describe('Print lines and exit instead of following live'),
    }),
    arguments: z.object({}),
});

export type Input = z.infer<typeof inputSchema>;

export type LogData = {
    logFilePath: string;
    lines: string[];
    projectName: string;
};

export type Output = {
    messages: string[];
    data?: LogData;
};

export interface Injections {
    projectRoot: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    spawnFn?: typeof nodeSpawn;
}

const handlerMaker: CommandHandlerMaker<Injections, Input, Output> = (injections) => async (input) => {
    const { projectRoot, localConfigFolderPath, globalConfigFolderPath, spawnFn } = injections;
    const lines = input.options.lines ?? DEFAULT_TAIL_LINES;
    const noFollow = input.options.noFollow === true;

    const validationResult = await validateCurrentLumpProjectRoot({ cwd: projectRoot });
    if (!validationResult.success) return commandFailure(validationResult.data);
    const nameResult = await getProjectName({ localConfigFolderPath, projectRoot });
    if (!nameResult.success) return commandFailure(nameResult.data);
    const projectName = nameResult.data;
    const logFilePath = supervisorLogPath({ globalConfigFolderPath, projectName });

    try {
        await access(logFilePath);
    } catch {
        return failure({
            messages: [
                `No supervisor log file for "${projectName}" at ${logFilePath}. The supervisor has not run for this project; start it with \`lumpcode start\` or \`lumpcode start --superviseOnly\`.`,
            ],
        });
    }

    const tailResult = await tailFile({
        filePath: logFilePath,
        lines,
        follow: !noFollow,
        spawnFn,
    });
    if (!tailResult.success) {
        return failure({ messages: [tailResult.data] });
    }
    if (!noFollow) {
        return success({
            messages: ['Stopped following supervisor log.'],
        });
    }
    const outputLines = 'lines' in tailResult.data ? tailResult.data.lines : [];
    return success({
        messages: outputLines,
        data: {
            logFilePath,
            lines: outputLines,
            projectName,
        },
    });
};

export const command = {
    handlerMaker,
    name: 'supervisor-log',
    description:
        'Tail this project\'s supervisor log file (follows live by default). Pass --lines to limit initial output; pass --noFollow to print and exit.',
    inputSchema,
} satisfies Command;
