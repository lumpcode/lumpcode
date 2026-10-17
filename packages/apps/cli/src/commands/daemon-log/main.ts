import { access } from 'node:fs/promises';
import { spawn as nodeSpawn } from 'node:child_process';
import * as z from 'zod';

import { failure, success } from '@lumpcode/core';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import { createCliLogger, DEFAULT_TAIL_LINES, resolveDaemonCommandScope, tailFile } from '../../utils';

const inputSchema = z.object({
    options: baseCommandOptionsSchema.extend({
        daemonId: z.string().optional().describe('Read the log for this daemon id'),
        lumpName: z
            .string()
            .optional()
            .describe('Deprecated: treated as --daemonId'),
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
    const lines = input.options.lines ?? DEFAULT_TAIL_LINES;
    const noFollow = input.options.noFollow === true;
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

    try {
        await access(logFilePath);
    } catch {
        return failure({
            messages: [
                `No daemon log file for "${projectName}"${scopeLabel} at ${logFilePath}. Start the daemon first or check --daemonId.`,
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
            messages: ['Stopped following daemon log.'],
        });
    }
    const outputLines = 'lines' in tailResult.data ? tailResult.data.lines : [];
    return success({
        messages: outputLines,
        data: {
            logFilePath,
            lines: outputLines,
            daemonId,
        },
    });
};

export const command = {
    handlerMaker,
    name: 'daemon-log',
    description:
        'Tail the background daemon log file (follows live by default). Pass --lines to limit initial output; pass --noFollow to print and exit. Pass --daemonId to select a daemon (default: global).',
    inputSchema,
} satisfies Command;
