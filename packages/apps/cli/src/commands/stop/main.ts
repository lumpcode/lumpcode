import * as fs from 'node:fs/promises';
import * as z from 'zod';

import { failure, success } from '@lumpcode/core';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import { orCommandFailure, readDaemonPidIfAlive } from '../../utils';
import { resolveDaemonPaths } from '../../utils/resolveDaemonPaths';
import { validateCurrentLumpProjectRoot } from '../../utils/validateCurrentLumpProjectRoot';

const inputSchema = z.object({
    options: baseCommandOptionsSchema.extend({
        lumpName: z.string().optional().describe('Stop the daemon scoped to a single lump'),
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

const sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms));

const handlerMaker: CommandHandlerMaker<Injections, Input, Output> = (injections) => async (input) => {
    const { projectRoot, localConfigFolderPath, globalConfigFolderPath } = injections;
    const lumpNameOpt = input.options.lumpName?.trim() ? input.options.lumpName.trim() : undefined;

    const validationResult = await orCommandFailure(
        await validateCurrentLumpProjectRoot({ cwd: projectRoot }),
    );
    if (!validationResult.success) return validationResult;

    const pathsResult = await orCommandFailure(
        await resolveDaemonPaths({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            lumpName: lumpNameOpt,
        }),
    );
    if (!pathsResult.success) return pathsResult;

    const { pidFilePath, metaFilePath, projectName } = pathsResult.data;
    const scopeLabel = lumpNameOpt ? ` lump "${lumpNameOpt}"` : '';

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

    try {
        process.kill(pid, 'SIGTERM');
    } catch (e) {
        const code =
            e && typeof e === 'object' && 'code' in e ? (e as NodeJS.ErrnoException).code : undefined;
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

    const deadlineMs = 5000;
    const deadline = Date.now() + deadlineMs;
    while (Date.now() < deadline) {
        try {
            process.kill(pid, 0);
        } catch {
            await fs.unlink(pidFilePath).catch(() => {});
            await fs.unlink(metaFilePath).catch(() => {});
            return success({
                messages: [
                    `Stopped Lumpcode daemon for "${projectName}"${scopeLabel} (was pid ${pid}).`,
                ],
            });
        }
        await sleep(50);
    }

    return failure({
        messages: [
            `Sent SIGTERM to pid ${pid} but it did not exit within ${deadlineMs / 1000}s. PID file left at ${pidFilePath}.`,
        ],
    });
};

export const command = {
    handlerMaker,
    name: 'stop',
    description:
        'Stop the background Lumpcode daemon for this project (reads PID from ~/.lumpcode/daemons/). Pass `--lumpName` to stop a per-lump daemon.',
    inputSchema,
} satisfies Command;
