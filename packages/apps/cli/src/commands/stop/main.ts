import * as fs from 'node:fs/promises';
import * as z from 'zod';

import { failure, success } from '@lumpcode/core';

import { isProcessAlive } from '../../utils/isProcessAlive';
import { nodeErrnoCode } from '../../utils/nodeErrnoCode';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import { killProcessTree, pollUntil, readDaemonMeta, readDaemonPidIfAlive, resolveDaemonCommandScope } from '../../utils';

const inputSchema = z.object({
    options: baseCommandOptionsSchema.extend({
        lumpName: z.string().optional().describe('Stop the daemon scoped to a single lump'),
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

    const scopeResult = await resolveDaemonCommandScope({
        projectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
        lumpName: input.options.lumpName,
    });
    if (!scopeResult.success) return scopeResult;
    const { lumpName: lumpNameOpt, scopeLabel, paths } = scopeResult.data;
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
    const pollDead = () =>
        pollUntil({ timeoutMs: 5000, intervalMs: 50, poll: () => (!isProcessAlive(pid, { onProbeError: 'dead' }) ? true : undefined) });
    const unlinkArtifacts = async () => { await fs.unlink(pidFilePath).catch(() => {}); await fs.unlink(metaFilePath).catch(() => {}); };

    const metaResult = await readDaemonMeta(metaFilePath);
    if (!metaResult.success) {
        return failure({ messages: [metaResult.data] });
    }
    if (!force && metaResult.data.busy === true) {
        return failure({
            messages: [
                'Daemon is busy running a lump; wait for it to finish or run `lumpcode stop --force`.',
            ],
            data: { code: 'daemonBusy' as const },
        });
    }

    if (force) {
        const killResult = await killProcessTree({ pid });
        if (!killResult.success) {
            return failure({ messages: [killResult.data] });
        }

        if (await pollDead()) {
            await unlinkArtifacts();
            return success({
                messages: [
                    `Force-stopped Lumpcode daemon for "${projectName}"${scopeLabel} (was pid ${pid}).`,
                ],
            });
        }

        return failure({
            messages: [
                `Force-killed pid ${pid} but it did not exit within 5s. PID file left at ${pidFilePath}.`,
            ],
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
        });
    }

    return failure({
        messages: [
            `Sent SIGTERM to pid ${pid} but it did not exit within 5s. PID file left at ${pidFilePath}.`,
        ],
    });
};

export const command = {
    handlerMaker,
    name: 'stop',
    description:
        'Stop the background Lumpcode daemon for this project (reads PID from ~/.lumpcode/daemons/). Pass `--lumpName` to stop a per-lump daemon. Pass `--force` when a lump run is active.',
    inputSchema,
} satisfies Command;
