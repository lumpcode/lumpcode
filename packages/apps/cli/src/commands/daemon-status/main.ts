import * as z from 'zod';

import { failure, success } from '@lumpcode/core';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import { orCommandFailure, readDaemonMeta, readDaemonPidIfAlive } from '../../utils';
import { resolveDaemonPaths } from '../../utils/resolveDaemonPaths';
import { validateCurrentLumpProjectRoot } from '../../utils/validateCurrentLumpProjectRoot';

const inputSchema = z.object({
    options: baseCommandOptionsSchema.extend({
        lumpName: z.string().optional().describe('Inspect the daemon scoped to a single lump'),
    }),
    arguments: z.object({}),
});

export type Input = z.infer<typeof inputSchema>;

export type StatusData = {
    running: boolean;
    projectName: string;
    pidFilePath: string;
    logFilePath: string;
    metaFilePath: string;
    pid?: number;
    cronSetup?: string;
    lumpName?: string;
    workspaceStrategy?: string;
    stalePidFile?: boolean;
};

export type Output = {
    messages: string[];
    data?: StatusData;
};

export interface Injections {
    projectRoot: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
}

async function readMetaFromFile(metaFilePath: string): Promise<{
    cronSetup?: string;
    lumpName?: string;
    workspaceStrategy?: string;
}> {
    const metaResult = await readDaemonMeta(metaFilePath);
    if (!metaResult.success) {
        return {};
    }
    return {
        ...(metaResult.data.cronSetup !== undefined ? { cronSetup: metaResult.data.cronSetup } : {}),
        ...(metaResult.data.lumpName !== undefined ? { lumpName: metaResult.data.lumpName } : {}),
        workspaceStrategy: metaResult.data.workspaceStrategy,
    };
}

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

    const { pidFilePath, logFilePath, metaFilePath, projectName } = pathsResult.data;
    const meta = await readMetaFromFile(metaFilePath);
    const scopeLabel = lumpNameOpt ? ` lump "${lumpNameOpt}"` : '';

    const pidAliveResult = await readDaemonPidIfAlive(pidFilePath);
    if (!pidAliveResult.success) {
        return failure({ messages: [pidAliveResult.data] });
    }
    const pidAlive = pidAliveResult.data;
    if (pidAlive === undefined) {
        const messages: string[] = [
            `No Lumpcode background daemon PID file for "${projectName}"${scopeLabel} (${pidFilePath}). The daemon is not running.`,
        ];
        if (meta.cronSetup !== undefined) {
            messages.push(`Detached schedule on file: ${meta.cronSetup}`);
        }
        return success({
            messages,
            data: {
                running: false,
                projectName,
                pidFilePath,
                logFilePath,
                metaFilePath,
                ...(lumpNameOpt !== undefined ? { lumpName: lumpNameOpt } : {}),
                ...(meta.cronSetup !== undefined ? { cronSetup: meta.cronSetup } : {}),
            },
        });
    }

    if ('stale' in pidAlive) {
        const messages: string[] = [
            `PID file for "${projectName}"${scopeLabel} references a process that is not running (stale PID file at ${pidFilePath}).`,
        ];
        if (meta.cronSetup !== undefined) {
            messages.push(`Last recorded cron schedule: ${meta.cronSetup}`);
        }
        return success({
            messages,
            data: {
                running: false,
                projectName,
                pidFilePath,
                logFilePath,
                metaFilePath,
                stalePidFile: true,
                ...(lumpNameOpt !== undefined ? { lumpName: lumpNameOpt } : {}),
                ...(meta.cronSetup !== undefined ? { cronSetup: meta.cronSetup } : {}),
            },
        });
    }

    const pid = pidAlive.pid;
    const messages: string[] = [
        `Lumpcode background daemon is running for "${projectName}"${scopeLabel} (pid ${pid}).`,
        `Log file: ${logFilePath}`,
    ];
    if (meta.cronSetup !== undefined) {
        messages.push(`Cron schedule: ${meta.cronSetup}`);
    } else {
        messages.push(
            'Cron schedule is not recorded in the daemon metadata file (restart with a current lumpcode to refresh it).',
        );
    }

    return success({
        messages,
        data: {
            running: true,
            projectName,
            pidFilePath,
            logFilePath,
            metaFilePath,
            pid,
            ...(lumpNameOpt !== undefined ? { lumpName: lumpNameOpt } : meta.lumpName !== undefined ? { lumpName: meta.lumpName } : {}),
            ...(meta.cronSetup !== undefined ? { cronSetup: meta.cronSetup } : {}),
            workspaceStrategy: meta.workspaceStrategy,
        },
    });
};

export const command = {
    handlerMaker,
    name: 'daemon-status',
    description:
        'Show whether the background daemon is running and its cron scheduling configuration. Pass `--lumpName` to inspect a per-lump daemon.',
    inputSchema,
} satisfies Command;
