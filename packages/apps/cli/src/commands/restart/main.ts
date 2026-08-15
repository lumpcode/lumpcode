import { spawn as nodeSpawn } from 'node:child_process';
import * as z from 'zod';

import { failure, success } from '@lumpcode/core';

import { DAEMON_FORCE_STOP_WAIT_MS, DAEMON_IDLE_STOP_WAIT_MS } from '../../consts';
import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import {
    createCliLogger,
    fromMeta,
    launchStartDaemon,
    readDaemonMeta,
    readDaemonPidIfAlive,
    readProjectLocalConfig,
    readStartDaemonDesired,
    recipeFromDesired,
    resolveDaemonCommandScope,
    stopOneDaemon,
    stopOneDaemonCliFailure,
    stoppedDaemonCliMessage,
    unlinkBestEffort,
    type StartDaemonDesired,
    type StartDaemonRecipe,
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
    /** Test-only: forwarded to `start`. */
    skipEnsureSupervisor?: boolean;
}

const handlerMaker: CommandHandlerMaker<Injections, Input, Output> = (injections) => async (input) => {
    const { projectRoot, localConfigFolderPath, globalConfigFolderPath, waitForShutdownOverride, spawnFn, skipEnsureSupervisor } =
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

    const localConfigResult = await readProjectLocalConfig({ localConfigFolderPath });
    if (!localConfigResult.success) {
        return failure({ messages: [localConfigResult.data] });
    }

    const daemonId = scopeResult.data.daemonId;
    const { scopeLabel, paths } = scopeResult.data;
    const { desiredFilePath, metaFilePath, pidFilePath, projectName } = paths;

    const desiredResult = await readStartDaemonDesired(desiredFilePath);
    if (!desiredResult.success) {
        return failure({ messages: [desiredResult.data] });
    }
    const metaResult = await readDaemonMeta(metaFilePath);
    const metaCorrupt = !metaResult.success;

    let snapshot: StartDaemonDesired | undefined;
    if (desiredResult.data !== undefined) {
        snapshot = desiredResult.data;
    } else if (metaResult.success) {
        snapshot = fromMeta(metaResult.data, { projectRoot, daemonId });
    }

    const cliCtx = {
        projectName,
        daemonId,
        scopeLabel,
        pidFilePath,
        metaFilePath,
        force: false,
        waitMs: DAEMON_IDLE_STOP_WAIT_MS,
    };

    if (snapshot === undefined) {
        const pidAliveResult = await readDaemonPidIfAlive(pidFilePath);
        if (!pidAliveResult.success) {
            return failure({ messages: [pidAliveResult.data] });
        }
        switch (pidAliveResult.data.status) {
            case 'alive':
                return failure({
                    messages: [
                        'Cannot restart: desired.json is missing and daemon meta is unreadable. Run `lumpcode start` with the intended flags.',
                    ],
                });
            case 'stale':
                await unlinkBestEffort([pidFilePath, metaFilePath, desiredFilePath]);
                return stopOneDaemonCliFailure({ status: 'stale' }, cliCtx);
            case 'missing':
                return stopOneDaemonCliFailure({ status: 'missing' }, cliCtx);
            default: {
                const _exhaustive: never = pidAliveResult.data;
                return _exhaustive;
            }
        }
    }

    const recipe: StartDaemonRecipe = recipeFromDesired(
        snapshot,
        localConfigResult.data.workspaceStrategy,
    );

    const force = metaCorrupt;
    const waitMs = force ? DAEMON_FORCE_STOP_WAIT_MS : DAEMON_IDLE_STOP_WAIT_MS;
    const stopped = await stopOneDaemon({
        pidFilePath,
        metaFilePath,
        desiredFilePath,
        force,
        waitMs,
        logger,
    });
    if (stopped.status !== 'stopped') {
        return stopOneDaemonCliFailure(stopped, {
            ...cliCtx,
            force,
            waitMs,
        });
    }

    const startResult = await launchStartDaemon({
        recipe,
        frozenLocalConfig: localConfigResult.data,
        localConfigFolderPath,
        globalConfigFolderPath,
        projectName,
        json,
        cliVerbose: !!input.options.verbose,
        foreground: false,
        logger,
        waitForShutdownOverride,
        spawnFn,
        skipEnsureSupervisor,
    });
    if (!startResult.success) {
        return failure(startResult.data);
    }

    return success({
        messages: [
            stoppedDaemonCliMessage({
                force,
                daemonId,
                projectName,
                scopeLabel,
                pid: stopped.pid,
            }),
            ...startResult.data.messages,
        ],
        data: startResult.data.data,
    });
};

export const command = {
    handlerMaker,
    name: 'restart',
    description:
        'Restart a background Lumpcode daemon (stop then start), preserving cron and filters from desired.json. Pass `--daemonId` to select a daemon (default: global).',
    inputSchema,
} satisfies Command;
