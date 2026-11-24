import { spawn as nodeSpawn } from 'node:child_process';
import * as z from 'zod';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import { completeLogTail, followableTailOptionFields, getProjectName, supervisorLogPath } from '../../utils';
import { commandFailure } from '../../utils/commandFailure';
import { validateCurrentLumpProjectRoot } from '../../utils/validateCurrentLumpProjectRoot';

const inputSchema = z.object({
    options: baseCommandOptionsSchema.extend({
        ...followableTailOptionFields,
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

    const validationResult = await validateCurrentLumpProjectRoot({ cwd: projectRoot });
    if (!validationResult.success) return commandFailure(validationResult.data);
    const nameResult = await getProjectName({ localConfigFolderPath, projectRoot });
    if (!nameResult.success) return commandFailure(nameResult.data);
    const projectName = nameResult.data;
    const logFilePath = supervisorLogPath({ globalConfigFolderPath, projectName });

    return completeLogTail({
        filePath: logFilePath,
        lines: input.options.lines,
        noFollow: input.options.noFollow === true,
        spawnFn,
        missingMessage: `No supervisor log file for "${projectName}" at ${logFilePath}. The supervisor has not run for this project; start it with \`lumpcode start\` or \`lumpcode start --superviseOnly\`.`,
        followedMessage: 'Stopped following supervisor log.',
        data: (outputLines) => ({
            logFilePath,
            lines: outputLines,
            projectName,
        }),
    });
};

export const command = {
    handlerMaker,
    name: 'supervisor-log',
    description:
        'Tail this project\'s supervisor log file (follows live by default). Pass --lines to limit initial output; pass --noFollow to print and exit.',
    inputSchema,
} satisfies Command;
