import * as z from 'zod';

import { failure, success } from '@lumpcode/core';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import {
    readDaemonMeta,
    readDaemonPidIfAlive,
    resolveDaemonCommandScope,
    type DaemonMetaReadErrorReason,
} from '../../utils';

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
    inFlightLumpCount?: number;
    stalePidFile?: boolean;
    metaStatus?: DaemonMetaReadErrorReason;
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

type MetaRead =
    | {
          ok: true;
          cronSetup?: string;
          lumpName?: string;
          workspaceStrategy: string;
          inFlightLumpCount: number;
      }
    | {
          ok: false;
          reason: DaemonMetaReadErrorReason;
      };

async function readMetaFromFile(metaFilePath: string): Promise<MetaRead> {
    const metaResult = await readDaemonMeta(metaFilePath);
    if (!metaResult.success) {
        return { ok: false, reason: metaResult.data.reason };
    }
    return {
        ok: true,
        ...(metaResult.data.cronSetup !== undefined ? { cronSetup: metaResult.data.cronSetup } : {}),
        ...(metaResult.data.lumpName !== undefined ? { lumpName: metaResult.data.lumpName } : {}),
        workspaceStrategy: metaResult.data.workspaceStrategy,
        inFlightLumpCount: metaResult.data.inFlightLumpCount ?? 0,
    };
}

const handlerMaker: CommandHandlerMaker<Injections, Input, Output> = (injections) => async (input) => {
    const { projectRoot, localConfigFolderPath, globalConfigFolderPath } = injections;
    const scopeResult = await resolveDaemonCommandScope({
        projectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
        lumpName: input.options.lumpName,
    });
    if (!scopeResult.success) return scopeResult;
    const { lumpName: lumpNameOpt, scopeLabel, paths } = scopeResult.data;
    const { pidFilePath, logFilePath, metaFilePath, projectName } = paths;

    const meta = await readMetaFromFile(metaFilePath);

    const pidAliveResult = await readDaemonPidIfAlive(pidFilePath);
    if (!pidAliveResult.success) {
        return failure({ messages: [pidAliveResult.data] });
    }
    const pidAlive = pidAliveResult.data;
    if (pidAlive === undefined) {
        const messages: string[] = [
            `No Lumpcode background daemon PID file for "${projectName}"${scopeLabel} (${pidFilePath}). The daemon is not running.`,
        ];
        if (meta.ok && meta.cronSetup !== undefined) {
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
                ...(meta.ok && meta.cronSetup !== undefined ? { cronSetup: meta.cronSetup } : {}),
                ...(!meta.ok ? { metaStatus: meta.reason } : {}),
            },
        });
    }

    if ('stale' in pidAlive) {
        const messages: string[] = [
            `PID file for "${projectName}"${scopeLabel} references a process that is not running (stale PID file at ${pidFilePath}).`,
        ];
        if (meta.ok && meta.cronSetup !== undefined) {
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
                ...(meta.ok && meta.cronSetup !== undefined ? { cronSetup: meta.cronSetup } : {}),
                ...(!meta.ok ? { metaStatus: meta.reason } : {}),
            },
        });
    }

    const pid = pidAlive.pid;

    if (!meta.ok) {
        const messages = [
            `Lumpcode background daemon is running for "${projectName}"${scopeLabel} (pid ${pid}).`,
            `Log file: ${logFilePath}`,
            `Daemon meta is invalid (reason: ${meta.reason}) at ${metaFilePath}; run \`lumpcode stop --force\` to repair.`,
        ];
        return success({
            messages,
            data: {
                running: true,
                projectName,
                pidFilePath,
                logFilePath,
                metaFilePath,
                pid,
                metaStatus: meta.reason,
                ...(lumpNameOpt !== undefined ? { lumpName: lumpNameOpt } : {}),
            },
        });
    }

    const inFlightLumpCount = meta.inFlightLumpCount;
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
    messages.push(`In-flight lump runs: ${inFlightLumpCount}`);

    return success({
        messages,
        data: {
            running: true,
            projectName,
            pidFilePath,
            logFilePath,
            metaFilePath,
            pid,
            ...(lumpNameOpt !== undefined
                ? { lumpName: lumpNameOpt }
                : meta.lumpName !== undefined
                  ? { lumpName: meta.lumpName }
                  : {}),
            ...(meta.cronSetup !== undefined ? { cronSetup: meta.cronSetup } : {}),
            workspaceStrategy: meta.workspaceStrategy,
            inFlightLumpCount,
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
