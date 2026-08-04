import * as z from 'zod';

import { failure, success, type Failure, type Success } from '@lumpcode/core';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import {
    createCliLogger,
    daemonMetaInclude,
    daemonsDirPath,
    getProjectName,
    listRunningProjectDaemons,
    readDaemonMeta,
    readDaemonPidIfAlive,
    resolveDaemonCommandScope,
    resolveDaemonPaths,
    type DaemonMetaReadErrorReason,
} from '../../utils';
import { commandFailure } from '../../utils/commandFailure';
import { validateCurrentLumpProjectRoot } from '../../utils/validateCurrentLumpProjectRoot';

const inputSchema = z.object({
    options: baseCommandOptionsSchema.extend({
        daemonId: z.string().optional().describe('Inspect the daemon with this id'),
        lumpName: z
            .string()
            .optional()
            .describe('Deprecated: treated as --daemonId'),
    }),
    arguments: z.object({}),
});

export type Input = z.infer<typeof inputSchema>;

export type StatusData = {
    running: boolean;
    projectName: string;
    daemonId: string;
    pidFilePath: string;
    logFilePath: string;
    metaFilePath: string;
    pid?: number;
    cronSetup?: string;
    include?: string[];
    exclude?: string[];
    maxParallelRun?: number;
    /** @deprecated */
    lumpName?: string;
    workspaceStrategy?: string;
    inFlightLumpCount?: number;
    stalePidFile?: boolean;
    metaStatus?: DaemonMetaReadErrorReason;
};

export type Output = {
    messages: string[];
    data?: StatusData | { projectName: string; daemons: StatusData[] };
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
          include?: string[];
          exclude?: string[];
          maxParallelRun?: number;
          workspaceStrategy: string;
          inFlightLumpCount: number;
          daemonId?: string;
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
    const include = daemonMetaInclude(metaResult.data);
    return {
        ok: true,
        ...(metaResult.data.daemonId !== undefined ? { daemonId: metaResult.data.daemonId } : {}),
        ...(metaResult.data.cronSetup !== undefined ? { cronSetup: metaResult.data.cronSetup } : {}),
        ...(metaResult.data.lumpName !== undefined ? { lumpName: metaResult.data.lumpName } : {}),
        ...(include !== undefined ? { include } : {}),
        ...(metaResult.data.exclude !== undefined ? { exclude: metaResult.data.exclude } : {}),
        ...(metaResult.data.maxParallelRun !== undefined
            ? { maxParallelRun: metaResult.data.maxParallelRun }
            : {}),
        workspaceStrategy: metaResult.data.workspaceStrategy,
        inFlightLumpCount: metaResult.data.inFlightLumpCount ?? 0,
    };
}

async function statusForDaemonId(input: {
    projectRoot: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    daemonId: string;
    lumpNameDeprecated?: string;
}): Promise<Success<{ messages: string[]; data: StatusData }> | Failure<string>> {
    const pathsResult = await resolveDaemonPaths({
        ...input,
        allowLegacyGlobalAlias: true,
    });
    if (!pathsResult.success) {
        return failure(pathsResult.data);
    }
    const { pidFilePath, logFilePath, metaFilePath, projectName, daemonId } = pathsResult.data;
    const scopeLabel = ` daemon "${daemonId}"`;
    const meta = await readMetaFromFile(metaFilePath);

    const pidAliveResult = await readDaemonPidIfAlive(pidFilePath);
    if (!pidAliveResult.success) {
        return failure(pidAliveResult.data);
    }
    const pidAlive = pidAliveResult.data;

    const baseData = {
        projectName,
        daemonId,
        pidFilePath,
        logFilePath,
        metaFilePath,
        ...(input.lumpNameDeprecated !== undefined ? { lumpName: input.lumpNameDeprecated } : {}),
    };

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
                ...baseData,
                ...(meta.ok && meta.cronSetup !== undefined ? { cronSetup: meta.cronSetup } : {}),
                ...(meta.ok && meta.include !== undefined ? { include: meta.include } : {}),
                ...(meta.ok && meta.exclude !== undefined ? { exclude: meta.exclude } : {}),
                ...(!meta.ok ? { metaStatus: meta.reason } : {}),
            },
        });
    }

    if ('stale' in pidAlive) {
        const messages: string[] = [
            `PID file for "${projectName}"${scopeLabel} references a process that is not running (stale PID file at ${pidFilePath}).`,
        ];
        return success({
            messages,
            data: {
                running: false,
                ...baseData,
                stalePidFile: true,
                ...(meta.ok && meta.cronSetup !== undefined ? { cronSetup: meta.cronSetup } : {}),
                ...(!meta.ok ? { metaStatus: meta.reason } : {}),
            },
        });
    }

    const pid = pidAlive.pid;
    if (!meta.ok) {
        return success({
            messages: [
                `Lumpcode background daemon is running for "${projectName}"${scopeLabel} (pid ${pid}).`,
                `Log file: ${logFilePath}`,
                `Daemon meta is invalid (reason: ${meta.reason}) at ${metaFilePath}; run \`lumpcode stop --force\` to repair.`,
            ],
            data: {
                running: true,
                ...baseData,
                pid,
                metaStatus: meta.reason,
            },
        });
    }

    const messages: string[] = [
        `Lumpcode background daemon "${daemonId}" is running for "${projectName}" (pid ${pid}).`,
        `Log file: ${logFilePath}`,
    ];
    if (meta.cronSetup !== undefined) {
        messages.push(`Cron schedule: ${meta.cronSetup}`);
    }
    if (meta.include?.length) {
        messages.push(`Include: ${meta.include.join(', ')}`);
    }
    if (meta.exclude?.length) {
        messages.push(`Exclude: ${meta.exclude.join(', ')}`);
    }
    messages.push(`In-flight lump runs: ${meta.inFlightLumpCount}`);

    return success({
        messages,
        data: {
            running: true,
            ...baseData,
            pid,
            ...(meta.cronSetup !== undefined ? { cronSetup: meta.cronSetup } : {}),
            ...(meta.include !== undefined ? { include: meta.include } : {}),
            ...(meta.exclude !== undefined ? { exclude: meta.exclude } : {}),
            ...(meta.maxParallelRun !== undefined ? { maxParallelRun: meta.maxParallelRun } : {}),
            workspaceStrategy: meta.workspaceStrategy,
            inFlightLumpCount: meta.inFlightLumpCount,
        },
    });
}

const handlerMaker: CommandHandlerMaker<Injections, Input, Output> = (injections) => async (input) => {
    const { projectRoot, localConfigFolderPath, globalConfigFolderPath } = injections;
    const logger = createCliLogger({
        verbose: !!input.options.verbose,
        json: !!input.options.json,
        prefix: '[lumpcode daemon-status]',
    });

    const daemonIdOpt = input.options.daemonId?.trim() || undefined;
    const lumpNameOpt = input.options.lumpName?.trim() || undefined;
    const listAll = !daemonIdOpt && !lumpNameOpt;

    if (listAll) {
        const validationResult = await validateCurrentLumpProjectRoot({ cwd: projectRoot });
        if (!validationResult.success) return commandFailure(validationResult.data);
        const nameResult = await getProjectName({ localConfigFolderPath, projectRoot });
        if (!nameResult.success) return commandFailure(nameResult.data);
        const projectName = nameResult.data;
        const daemonsDir = daemonsDirPath({ globalConfigFolderPath });
        const runningResult = await listRunningProjectDaemons({ daemonsDir, projectName });
        if (!runningResult.success) {
            return failure({ messages: [runningResult.data] });
        }

        const daemonIds = Object.keys(runningResult.data).sort();
        if (daemonIds.length === 0) {
            return success({
                messages: [`No Lumpcode background daemons running for "${projectName}".`],
                data: { projectName, daemons: [] },
            });
        }

        const daemons: StatusData[] = [];
        const messages: string[] = [`Lumpcode daemons for "${projectName}":`];
        for (const daemonId of daemonIds) {
            const one = await statusForDaemonId({
                projectRoot,
                localConfigFolderPath,
                globalConfigFolderPath,
                daemonId,
            });
            if (!one.success) {
                return failure({ messages: [one.data] });
            }
            const entry = one.data.data;
            daemons.push(entry);
            messages.push(`- ${daemonId}: running=${entry.running} pid=${entry.pid ?? 'n/a'}`);
        }
        return success({ messages, data: { projectName, daemons } });
    }

    const scopeResult = await resolveDaemonCommandScope({
        projectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
        daemonId: daemonIdOpt,
        lumpName: lumpNameOpt,
        logger,
    });
    if (!scopeResult.success) return scopeResult;

    const one = await statusForDaemonId({
        projectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
        daemonId: scopeResult.data.daemonId,
        lumpNameDeprecated: lumpNameOpt,
    });
    if (!one.success) {
        return failure({ messages: [one.data] });
    }
    return success(one.data);
};

export const command = {
    handlerMaker,
    name: 'daemon-status',
    description:
        'Show daemon status. With no flags, lists all project daemons. Pass `--daemonId` for a single daemon.',
    inputSchema,
} satisfies Command;
