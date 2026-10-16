import * as z from 'zod';

import { failure, success } from '@lumpcode/core';
import { isLoopbackBind, startDashboardServer, type DashboardStatus } from '@lumpcode/dashboard';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import { createCliLogger, readProjectLocalConfig } from '../../utils';
import { commandFailure } from '../../utils/commandFailure';
import { validateCurrentLumpProjectRoot } from '../../utils/validateCurrentLumpProjectRoot';
import { command as daemonStatusCommand } from '../daemon-status';

const DASHBOARD_DEFAULT_PORT = 4747;
const DASHBOARD_DEFAULT_BIND = '127.0.0.1';

export const SHARED_MODE_DASHBOARD_MESSAGE =
    'lumpcode dashboard is dedicated-only. Use a worker clone with mode: dedicated (another copy of the repo on this machine is enough).';

const inputSchema = z.object({
    options: baseCommandOptionsSchema.extend({
        port: z.number().int().min(1).max(65535).optional().describe('TCP port to listen on (default 4747)'),
        bind: z.string().min(1).optional().describe('Address to listen on (default 127.0.0.1)'),
    }),
    arguments: z.object({}),
});

export type Input = z.infer<typeof inputSchema>;

export type Output = {
    messages: string[];
    data?: {
        url?: string;
        bindWarning?: string;
        code?: 'sharedModeNoDaemon' | 'portInUse';
    };
    printed?: boolean;
};

export interface Injections {
    projectRoot: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    /** Test seam. Production waits for SIGINT or SIGTERM. */
    waitForShutdownOverride?: () => Promise<void>;
}

export function resolveDashboardListen(options: { port?: number; bind?: string }): { port: number; bind: string } {
    return {
        port: options.port ?? DASHBOARD_DEFAULT_PORT,
        bind: options.bind ?? DASHBOARD_DEFAULT_BIND,
    };
}

function waitForProcessSignal(): Promise<void> {
    return new Promise((resolve) => {
        const onSignal = () => {
            process.off('SIGINT', onSignal);
            process.off('SIGTERM', onSignal);
            resolve();
        };
        process.on('SIGINT', onSignal);
        process.on('SIGTERM', onSignal);
    });
}

function isDashboardStatus(data: unknown): data is DashboardStatus {
    if (data === null || typeof data !== 'object') return false;
    const record = data as Record<string, unknown>;
    return typeof record.projectName === 'string'
        && Array.isArray(record.daemons)
        && record.supervisor !== null
        && typeof record.supervisor === 'object';
}

function bindWarningFor(bind: string): string | undefined {
    if (isLoopbackBind(bind)) return undefined;
    return `Warning: the dashboard is reachable on ${bind} with no authentication.`;
}

const handlerMaker: CommandHandlerMaker<Injections, Input, Output> = (injections) => async (input) => {
    const { projectRoot, localConfigFolderPath, globalConfigFolderPath, waitForShutdownOverride } = injections;
    const logger = createCliLogger({
        verbose: !!input.options.verbose,
        json: !!input.options.json,
        prefix: '[lumpcode dashboard]',
    });

    const validationResult = await validateCurrentLumpProjectRoot({ cwd: projectRoot });
    if (!validationResult.success) return commandFailure(validationResult.data);

    const localConfigResult = await readProjectLocalConfig({ localConfigFolderPath });
    if (!localConfigResult.success) return commandFailure(localConfigResult.data);

    if (localConfigResult.data.mode === 'shared') {
        return failure({
            messages: [SHARED_MODE_DASHBOARD_MESSAGE],
            data: { code: 'sharedModeNoDaemon' },
        });
    }

    const { port, bind } = resolveDashboardListen(input.options);
    const readDaemonStatus = daemonStatusCommand.handlerMaker({
        projectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
    });

    let started: Awaited<ReturnType<typeof startDashboardServer>>;
    try {
        started = await startDashboardServer({
            port,
            bind,
            readStatus: async () => {
                try {
                    const result = await readDaemonStatus({
                        options: {},
                        arguments: {},
                    });
                    if (!result.success) {
                        const message = result.data.messages.join('\n');
                        logger.verbose(message);
                        return { ok: false, message };
                    }
                    if (!isDashboardStatus(result.data.data)) {
                        const message = 'Expected a list-all daemon-status snapshot.';
                        logger.verbose(message);
                        return { ok: false, message };
                    }
                    return { ok: true, status: result.data.data };
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : String(error);
                    logger.verbose(message);
                    return { ok: false, message };
                }
            },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return commandFailure(message);
    }

    if (!started.success) {
        return failure({
            messages: [started.data.message],
            data: { code: started.data.code },
        });
    }

    const { url, close } = started.data;
    const bindWarning = bindWarningFor(bind);
    const messages = [`Dashboard: ${url}`];
    if (bindWarning !== undefined) messages.push(bindWarning);
    const data = {
        url,
        ...(bindWarning !== undefined ? { bindWarning } : {}),
    };

    if (input.options.json) {
        console.log(JSON.stringify({ messages, data }));
    } else {
        for (const line of messages) console.log(line);
    }

    try {
        if (waitForShutdownOverride !== undefined) {
            await waitForShutdownOverride();
        } else {
            await waitForProcessSignal();
        }
    } finally {
        try {
            await close();
        } catch (error: unknown) {
            logger.verbose(error instanceof Error ? error.message : String(error));
        }
    }

    return success({ messages, data, printed: true });
};

export const command = {
    handlerMaker,
    name: 'dashboard',
    description:
        'Serve a read-only page of daemon status for this project. Dedicated-only. Stays in the foreground until Ctrl+C.',
    inputSchema,
} satisfies Command;
