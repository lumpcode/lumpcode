import { spawn as nodeSpawn } from 'node:child_process';
import * as z from 'zod';

import { failure, success } from '@lumpcode/core';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import { command as startCommand, defaultCronPattern } from '../start/main';
import { command as stopCommand } from '../stop/main';
import {
    createCliLogger,
    daemonMetaInclude,
    readDaemonMeta,
    resolveDaemonCommandScope,
} from '../../utils';

const inputSchema = z.object({
    options: baseCommandOptionsSchema.extend({
        daemonId: z.string().optional().describe('Restart the daemon with this id'),
        lumpName: z
            .string()
            .optional()
            .describe('Deprecated: treated as --daemonId'),
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
        daemonId: string;
        include?: string[];
        exclude?: string[];
        maxParallelRun?: number;
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
}): Promise<{
    cronSetup: string;
    daemonId?: string;
    include?: string[];
    exclude?: string[];
    maxParallelRun?: number;
    metaCorrupt: boolean;
}> {
    const { metaFilePath } = input;
    const metaResult = await readDaemonMeta(metaFilePath);
    if (!metaResult.success) {
        return { cronSetup: defaultCronPattern, metaCorrupt: true };
    }
    const cronSetup =
        typeof metaResult.data.cronSetup === 'string' && metaResult.data.cronSetup.trim()
            ? metaResult.data.cronSetup.trim()
            : defaultCronPattern;
    const include = daemonMetaInclude(metaResult.data);
    return {
        cronSetup,
        metaCorrupt: false,
        ...(metaResult.data.daemonId !== undefined ? { daemonId: metaResult.data.daemonId } : {}),
        ...(include !== undefined ? { include } : {}),
        ...(metaResult.data.exclude !== undefined ? { exclude: metaResult.data.exclude } : {}),
        ...(metaResult.data.maxParallelRun !== undefined
            ? { maxParallelRun: metaResult.data.maxParallelRun }
            : {}),
    };
}

const handlerMaker: CommandHandlerMaker<Injections, Input, Output> = (injections) => async (input) => {
    const { projectRoot, localConfigFolderPath, globalConfigFolderPath, waitForShutdownOverride, spawnFn } =
        injections;
    const json = input.options.json === true;
    const logger = createCliLogger({
        verbose: !!input.options.verbose,
        json,
        prefix: '[lumpcode restart]',
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

    const meta = await readDaemonMetaForRestart({ metaFilePath: scopeResult.data.paths.metaFilePath });
    const cronSetup = meta.cronSetup;
    const daemonId = scopeResult.data.daemonId;

    const stopHandle = stopCommand.handlerMaker({
        projectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
    });
    const stopResult = await stopHandle({
        options: {
            json,
            daemonId,
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
            daemonId,
            ...(meta.include?.length ? { include: meta.include.join(',') } : {}),
            ...(meta.exclude?.length ? { exclude: meta.exclude.join(',') } : {}),
            ...(meta.maxParallelRun !== undefined ? { maxParallelRun: meta.maxParallelRun } : {}),
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
        'Restart a background Lumpcode daemon (stop then start), preserving cron and filters from meta. Pass `--daemonId` to select a daemon (default: global).',
    inputSchema,
} satisfies Command;
