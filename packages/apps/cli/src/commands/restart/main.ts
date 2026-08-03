import { spawn as nodeSpawn } from 'node:child_process';
import * as z from 'zod';

import { failure, success } from '@lumpcode/core';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import { command as startCommand, defaultCronPattern } from '../start/main';
import { command as stopCommand } from '../stop/main';
import { readDaemonMeta, resolveDaemonCommandScope } from '../../utils';

const inputSchema = z.object({
    options: baseCommandOptionsSchema.extend({
        lumpName: z.string().optional().describe('Restart the daemon scoped to a single lump'),
    }),
    arguments: z.object({}),
});

export type Input = z.infer<typeof inputSchema>;

export type Output = {
    messages: string[];
    data?: {
        cronSetup: string;
        lumpNames: string[];
        ticks: number;
        lumpName?: string;
    };
};

export interface Injections {
    projectRoot: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    /** When set (e.g. in tests), forwarded to `start` */
    waitForShutdownOverride?: () => Promise<void>;
    /** When set (e.g. in tests), forwarded to `start` */
    spawnFn?: typeof nodeSpawn;
}

async function readDaemonMetaForRestart(input: {
    metaFilePath: string;
}): Promise<{ cronSetup: string; lumpName?: string; metaCorrupt: boolean }> {
    const { metaFilePath } = input;
    const metaResult = await readDaemonMeta(metaFilePath);
    if (!metaResult.success) {
        return { cronSetup: defaultCronPattern, metaCorrupt: true };
    }
    const cronSetup =
        typeof metaResult.data.cronSetup === 'string' && metaResult.data.cronSetup.trim()
            ? metaResult.data.cronSetup.trim()
            : defaultCronPattern;
    const lumpName =
        typeof metaResult.data.lumpName === 'string' && metaResult.data.lumpName.trim()
            ? metaResult.data.lumpName.trim()
            : undefined;
    return {
        cronSetup,
        metaCorrupt: false,
        ...(lumpName !== undefined ? { lumpName } : {}),
    };
}

const handlerMaker: CommandHandlerMaker<Injections, Input, Output> = (injections) => async (input) => {
    const { projectRoot, localConfigFolderPath, globalConfigFolderPath, waitForShutdownOverride, spawnFn } =
        injections;
    const json = input.options.json === true;

    const scopeResult = await resolveDaemonCommandScope({
        projectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
        lumpName: input.options.lumpName,
    });
    if (!scopeResult.success) return scopeResult;

    const meta = await readDaemonMetaForRestart({ metaFilePath: scopeResult.data.paths.metaFilePath });
    const cronSetup = meta.cronSetup;
    const lumpNameOpt = scopeResult.data.lumpName ?? meta.lumpName;

    const stopHandle = stopCommand.handlerMaker({
        projectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
    });
    const stopResult = await stopHandle({
        options: {
            json,
            ...(lumpNameOpt !== undefined ? { lumpName: lumpNameOpt } : {}),
            ...(meta.metaCorrupt ? { force: true } : {}),
        },
        arguments: {},
    });
    if (!stopResult.success) {
        return failure(stopResult.data);
    }

    const startHandle = startCommand.handlerMaker({
        projectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
        waitForShutdownOverride,
        spawnFn,
    });
    const startResult = await startHandle({
        options: {
            json,
            cronSetup,
            ...(lumpNameOpt !== undefined ? { lumpName: lumpNameOpt } : {}),
        },
        arguments: {},
    });
    if (!startResult.success) {
        return failure(startResult.data);
    }

    return success({
        messages: [...stopResult.data.messages, ...startResult.data.messages],
        data: startResult.data.data,
    });
};

export const command = {
    handlerMaker,
    name: 'restart',
    description:
        'Restart the background daemon (stop, then start with the same cron schedule and scope as before, or the default if unknown). Pass `--lumpName` for a per-lump daemon.',
    inputSchema,
} satisfies Command;
