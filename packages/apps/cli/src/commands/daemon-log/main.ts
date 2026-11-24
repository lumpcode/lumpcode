import { spawn as nodeSpawn } from 'node:child_process';
import * as z from 'zod';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import { completeLogTail, createCliLogger, followableTailOptionFields, resolveDaemonCommandScope } from '../../utils';

const inputSchema = z.object({
    options: baseCommandOptionsSchema.extend({
        daemonId: z.string().optional().describe('Read the log for this daemon id'),
        lumpName: z
            .string()
            .optional()
            .describe('Deprecated: treated as --daemonId'),
        ...followableTailOptionFields,
    }),
    arguments: z.object({}),
});

export type Input = z.infer<typeof inputSchema>;

export type LogData = {
    logFilePath: string;
    lines: string[];
    daemonId: string;
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
    const logger = createCliLogger({
        verbose: !!input.options.verbose,
        json: !!input.options.json,
        prefix: '[lumpcode daemon-log]',
    });

    const scopeResult = await resolveDaemonCommandScope({
        projectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
        daemonId: input.options.daemonId,
        lumpName: input.options.lumpName,
        logger,
    });
    if (!scopeResult.success) return scopeResult;
    const { daemonId, scopeLabel, paths } = scopeResult.data;
    const { logFilePath, projectName } = paths;

    return completeLogTail({
        filePath: logFilePath,
        lines: input.options.lines,
        noFollow: input.options.noFollow === true,
        spawnFn,
        missingMessage: `No daemon log file for "${projectName}"${scopeLabel} at ${logFilePath}. Start the daemon first or check --daemonId.`,
        followedMessage: 'Stopped following daemon log.',
        data: (outputLines) => ({
            logFilePath,
            lines: outputLines,
            daemonId,
        }),
    });
};

export const command = {
    handlerMaker,
    name: 'daemon-log',
    description:
        'Tail the background daemon log file (follows live by default). Pass --lines to limit initial output; pass --noFollow to print and exit. Pass --daemonId to select a daemon (default: global).',
    inputSchema,
} satisfies Command;
