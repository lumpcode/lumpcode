import * as z from 'zod';

import { failure, success } from '@lumpcode/core';

import { DAEMON_FORCE_STOP_WAIT_MS, DAEMON_IDLE_STOP_WAIT_MS } from '../../consts';
import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import {
    createCliLogger,
    daemonsDirPath,
    getProjectName,
    resolveDaemonCommandScope,
    stopOneDaemon,
    stopOneDaemonCliFailure,
    stoppedDaemonCliMessage,
} from '../../utils';
import { commandFailure } from '../../utils/commandFailure';
import { validateCurrentLumpProjectRoot } from '../../utils/validateCurrentLumpProjectRoot';
import { stopAllProjectDaemons } from './stopAllProjectDaemons';

const inputSchema = z.object({
    options: baseCommandOptionsSchema.extend({
        daemonId: z.string().optional().describe('Stop the daemon with this id'),
        lumpName: z
            .string()
            .optional()
            .describe('Deprecated: treated as --daemonId'),
        force: z
            .boolean()
            .optional()
            .describe('Force-stop the daemon and its child processes (SIGKILL / taskkill)'),
        all: z
            .boolean()
            .optional()
            .describe('Stop every start-daemon for this project, then the supervisor'),
    }),
    arguments: z.object({}),
});

export type Input = z.infer<typeof inputSchema>;

export type Output = {
    messages: string[];
    data?: Record<string, unknown>;
};

export interface Injections {
    projectRoot: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
}

const handlerMaker: CommandHandlerMaker<Injections, Input, Output> = (injections) => async (input) => {
    const { projectRoot, localConfigFolderPath, globalConfigFolderPath } = injections;
    const force = input.options.force === true;
    const all = input.options.all === true;
    const logger = createCliLogger({
        verbose: !!input.options.verbose,
        json: !!input.options.json,
        prefix: '[lumpcode stop]',
    });

    if (all && (input.options.daemonId?.trim() || input.options.lumpName?.trim())) {
        return failure({
            messages: ['Pass only one of --all and --daemonId.'],
        });
    }

    if (all) {
        const validationResult = await validateCurrentLumpProjectRoot({ cwd: projectRoot });
        if (!validationResult.success) return commandFailure(validationResult.data);
        const nameResult = await getProjectName({ localConfigFolderPath, projectRoot });
        if (!nameResult.success) return commandFailure(nameResult.data);
        const projectName = nameResult.data;
        const stopAll = await stopAllProjectDaemons({
            projectName,
            daemonsDir: daemonsDirPath({ globalConfigFolderPath }),
            globalConfigFolderPath,
            force,
            logger,
        });
        if (!stopAll.success) {
            return failure({ messages: [stopAll.data] });
        }
        return success({
            messages: [
                stopAll.data.supervisorStopped
                    ? `Stopped all Lumpcode daemons and the supervisor for "${projectName}".`
                    : `Stopped all Lumpcode daemons for "${projectName}".`,
            ],
        });
    }

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
    const { pidFilePath, metaFilePath, desiredFilePath, projectName } = paths;

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
            projectName,
            daemonId,
            scopeLabel,
            pidFilePath,
            metaFilePath,
            force,
            waitMs,
        });
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
        ],
    });
};

export const command = {
    handlerMaker,
    name: 'stop',
    description:
        'Stop a background Lumpcode daemon for this project (reads PID from ~/.lumpcode/daemons/). Pass `--daemonId` to select a daemon (default: global). Pass `--all` to stop every start-daemon then the supervisor. Pass `--force` for immediate process-tree kill.',
    inputSchema,
} satisfies Command;
