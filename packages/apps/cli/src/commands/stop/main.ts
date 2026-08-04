import * as fs from 'node:fs/promises';
import * as z from 'zod';

import { failure, isProcessAlive, killProcessTree, nodeErrnoCode, success } from '@lumpcode/core';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import {
    createCliLogger,
    isDaemonMidRun,
    pollUntil,
    readDaemonMeta,
    readDaemonPidIfAlive,
    resolveDaemonCommandScope,
} from '../../utils';

const IDLE_STOP_WAIT_MS = 5000;
const FORCE_STOP_WAIT_MS = 5000;

const inputSchema = z.object({
    options: baseCommandOptionsSchema.extend({
        daemonId: z.string().optional().describe('Stop the daemon with this id (default: global)'),
        lumpName: z
            .string()
            .optional()
            .describe('Deprecated. Treated as --daemonId'),
        force: z
            .boolean()
            .optional()
            .describe('Force-stop the daemon and its child processes (SIGKILL / taskkill)'),
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
    const logger = createCliLogger({
        verbose: !!input.options.verbose,
        json: !!input.options.json,
        prefix: '[lumpcode stop]',
    });

    if (input.options.lumpName?.trim() && !input.options.daemonId?.trim()) {
        logger.warn('--lumpName on stop is deprecated; use --daemonId instead.');
    }

    const scopeResult = await resolveDaemonCommandScope({
        projectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
        daemonId: input.options.daemonId,
        lumpName: input.options.lumpName,
    });
    if (!scopeResult.success) return scopeResult;
    const { daemonId, scopeLabel, paths } = scopeResult.data;
    const { pidFilePath, metaFilePath, projectName } = paths;

    const pidAliveResult = await readDaemonPidIfAlive(pidFilePath);
    if (!pidAliveResult.success) {
        return failure({ messages: [pidAliveResult.data] });
    }
    const pidAlive = pidAliveResult.data;
    if (pidAlive === undefined) {
        return failure({
            messages: [
                `No daemon PID file for project "${projectName}"${scopeLabel} at ${pidFilePath}. The daemon may not be running.`,
            ],
        });
    }
    if ('stale' in pidAlive) {
        await fs.unlink(pidFilePath).catch(() => {});
        await fs.unlink(metaFilePath).catch(() => {});
        return failure({
            messages: [`Invalid PID in ${pidFilePath}; removed stale file.`],
        });
    }

    const pid = pidAlive.pid;
    const unlinkArtifacts = async () => {
        await fs.unlink(pidFilePath).catch(() => {});
        await fs.unlink(metaFilePath).catch(() => {});
    };

    const waitMs = force ? FORCE_STOP_WAIT_MS : IDLE_STOP_WAIT_MS;
    const waitSeconds = Math.round(waitMs / 1000);
    const pollDead = () =>
        pollUntil({
            timeoutMs: waitMs,
            intervalMs: 50,
            poll: () => (!isProcessAlive(pid, { onProbeError: 'dead' }) ? true : undefined),
        });

    if (force) {
        const killResult = await killProcessTree({ pid, graceMs: 0 });
        if (!killResult.success) {
            return failure({ messages: [killResult.data] });
        }

        if (await pollDead()) {
            await unlinkArtifacts();
            return success({
                messages: [
                    `Force-stopped Lumpcode daemon for "${projectName}"${scopeLabel} (was pid ${pid}).`,
                ],
                data: { daemonId },
            });
        }

        return failure({
            messages: [
                `Force-killed pid ${pid} but it did not exit within ${waitSeconds}s. PID file left at ${pidFilePath}.`,
            ],
        });
    }

    const metaResult = await readDaemonMeta(metaFilePath);
    if (!metaResult.success) {
        return failure({
            messages: [
                `Daemon meta is invalid (reason: ${metaResult.data.reason}) at ${metaFilePath} (pid ${pid}); ` +
                    'refusing graceful stop. Run `lumpcode stop --force`.',
            ],
            data: {
                code: 'daemonMetaCorrupt' as const,
                reason: metaResult.data.reason,
            },
        });
    }

    if (isDaemonMidRun(metaResult.data)) {
        return failure({
            messages: [
                'Daemon is busy running a lump (mid-run / in-flight); wait for it to finish or run `lumpcode stop --force`.',
            ],
            data: { code: 'daemonBusy' as const },
        });
    }

    try {
        process.kill(pid, 'SIGTERM');
    } catch (e) {
        const code = nodeErrnoCode(e);
        if (code === 'ESRCH') {
            await fs.unlink(pidFilePath).catch(() => {});
            await fs.unlink(metaFilePath).catch(() => {});
            return failure({
                messages: [
                    `Daemon process (pid ${pid}) was already gone; removed stale PID file at ${pidFilePath}.`,
                ],
            });
        }
        return failure({
            messages: [`Could not signal daemon (pid ${pid}): ${String(e)}`],
        });
    }

    if (await pollDead()) {
        await unlinkArtifacts();
        return success({
            messages: [
                `Stopped Lumpcode daemon for "${projectName}"${scopeLabel} (was pid ${pid}).`,
            ],
            data: { daemonId },
        });
    }

    return failure({
        messages: [
            `Sent SIGTERM to pid ${pid} but it did not exit within ${waitSeconds}s. PID file left at ${pidFilePath}.`,
        ],
    });
};

export const command = {
    handlerMaker,
    name: 'stop',
    description:
        'Stop a background Lumpcode daemon for this project (default daemonId=global). Pass `--daemonId` to target a filtered daemon. Pass `--force` for immediate process-tree kill.',
    inputSchema,
} satisfies Command;
