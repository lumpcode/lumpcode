import * as z from 'zod';

import { failure, success, type Failure, type Success } from '@lumpcode/core';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import {
    createCliLogger,
    daemonMetaInclude,
    daemonsDirPath,
    getProjectName,
    hasRunningDaemonMeta,
    listRunningProjectDaemons,
    readDaemonMeta,
    readDaemonPidIfAlive,
    resolveDaemonCommandScope,
    resolveDaemonPaths,
    supervisorLogPath,
    supervisorPidPath,
    type DaemonConfigFileMeta,
    type DaemonMeta,
    type DaemonMetaReadErrorReason,
    type DaemonPidReadResult,
    type DaemonSchedulerFiles,
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
    /** Present when this process was launched from a repo `.lumpcode/daemons/` recipe. */
    daemonConfigFile?: DaemonConfigFileMeta;
    stalePidFile?: boolean;
    metaStatus?: DaemonMetaReadErrorReason;
};

export type SupervisorStatusData = {
    running: boolean;
    pidFilePath: string;
    logFilePath: string;
    pid?: number;
    stalePidFile?: boolean;
};

export type Output = {
    messages: string[];
    data?: StatusData | { projectName: string; daemons: StatusData[]; supervisor: SupervisorStatusData };
};

export interface Injections {
    projectRoot: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
}

function toStatusData(input: {
    projectName: string;
    daemonId: string;
    files: Pick<DaemonSchedulerFiles, 'pidFilePath' | 'logFilePath' | 'metaFilePath'>;
    pidAlive: DaemonPidReadResult;
    meta: DaemonMeta | undefined;
    metaReason?: DaemonMetaReadErrorReason;
    lumpNameDeprecated?: string;
}): { messages: string[]; data: StatusData } {
    const { projectName, daemonId, files, pidAlive, meta, metaReason, lumpNameDeprecated } = input;
    const { pidFilePath, logFilePath, metaFilePath } = files;
    const scopeLabel = ` daemon "${daemonId}"`;
    const baseData = {
        projectName,
        daemonId,
        pidFilePath,
        logFilePath,
        metaFilePath,
        ...(lumpNameDeprecated !== undefined ? { lumpName: lumpNameDeprecated } : {}),
    };

    if (pidAlive.status === 'missing') {
        const messages: string[] = [
            `No Lumpcode background daemon PID file for "${projectName}"${scopeLabel} (${pidFilePath}). The daemon is not running.`,
        ];
        if (meta?.cronSetup !== undefined) {
            messages.push(`Detached schedule on file: ${meta.cronSetup}`);
        }
        return {
            messages,
            data: {
                running: false,
                ...baseData,
                ...(meta?.cronSetup !== undefined ? { cronSetup: meta.cronSetup } : {}),
                ...(meta?.include !== undefined ? { include: meta.include } : {}),
                ...(meta?.exclude !== undefined ? { exclude: meta.exclude } : {}),
                ...(metaReason !== undefined ? { metaStatus: metaReason } : {}),
            },
        };
    }

    if (pidAlive.status === 'stale') {
        return {
            messages: [
                `PID file for "${projectName}"${scopeLabel} references a process that is not running (stale PID file at ${pidFilePath}).`,
            ],
            data: {
                running: false,
                ...baseData,
                stalePidFile: true,
                ...(meta?.cronSetup !== undefined ? { cronSetup: meta.cronSetup } : {}),
                ...(metaReason !== undefined ? { metaStatus: metaReason } : {}),
            },
        };
    }

    const pid = pidAlive.pid;
    if (meta === undefined) {
        return {
            messages: [
                `Lumpcode background daemon is running for "${projectName}"${scopeLabel} (pid ${pid}).`,
                `Log file: ${logFilePath}`,
                `Daemon meta is invalid (reason: ${metaReason}) at ${metaFilePath}; run \`lumpcode stop --force\` to repair.`,
            ],
            data: {
                running: true,
                ...baseData,
                pid,
                metaStatus: metaReason,
            },
        };
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
    messages.push(`In-flight lump runs: ${meta.inFlightLumpCount ?? 0}`);
    if (meta.daemonConfigFile !== undefined) {
        messages.push(
            `Repo recipe: ${meta.daemonConfigFile.path} (${meta.daemonConfigFile.discoveryBranch})`,
        );
    }

    return {
        messages,
        data: {
            running: true,
            ...baseData,
            pid,
            cronSetup: meta.cronSetup,
            include: meta.include,
            exclude: meta.exclude,
            maxParallelRun: meta.maxParallelRun,
            workspaceStrategy: meta.workspaceStrategy,
            inFlightLumpCount: meta.inFlightLumpCount ?? 0,
            lumpName: meta.lumpName ?? lumpNameDeprecated,
            ...(meta.daemonConfigFile !== undefined
                ? { daemonConfigFile: meta.daemonConfigFile }
                : {}),
        },
    };
}

async function supervisorStatusForProject(input: {
    globalConfigFolderPath: string;
    projectName: string;
}): Promise<SupervisorStatusData> {
    const pidFilePath = supervisorPidPath(input);
    const logFilePath = supervisorLogPath(input);
    const pidAliveResult = await readDaemonPidIfAlive(pidFilePath);
    const base = { pidFilePath, logFilePath };
    if (!pidAliveResult.success || pidAliveResult.data.status === 'missing') {
        return { running: false, ...base };
    }
    if (pidAliveResult.data.status === 'stale') {
        return { running: false, stalePidFile: true, ...base };
    }
    return { running: true, pid: pidAliveResult.data.pid, ...base };
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
    const pidAliveResult = await readDaemonPidIfAlive(pidFilePath);
    if (!pidAliveResult.success) {
        return failure(pidAliveResult.data);
    }
    const metaResult = await readDaemonMeta(metaFilePath);
    return success(
        toStatusData({
            projectName,
            daemonId,
            files: { pidFilePath, logFilePath, metaFilePath },
            pidAlive: pidAliveResult.data,
            meta: metaResult.success
                ? { ...metaResult.data, include: daemonMetaInclude(metaResult.data) }
                : undefined,
            metaReason: metaResult.success ? undefined : metaResult.data.reason,
            lumpNameDeprecated: input.lumpNameDeprecated,
        }),
    );
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
        const supervisor = await supervisorStatusForProject({ globalConfigFolderPath, projectName });
        const supervisorLine = supervisor.running
            ? `Supervisor: running (pid ${supervisor.pid}).`
            : 'Supervisor: not running.';
        if (daemonIds.length === 0) {
            return success({
                messages: [`No Lumpcode background daemons running for "${projectName}".`, supervisorLine],
                data: { projectName, daemons: [], supervisor },
            });
        }

        const daemons: StatusData[] = [];
        const messages: string[] = [`Lumpcode daemons for "${projectName}":`];
        for (const daemonId of daemonIds) {
            const info = runningResult.data[daemonId]!;
            const entry = toStatusData({
                projectName,
                daemonId,
                files: info,
                pidAlive: { status: 'alive', pid: info.pid },
                ...(hasRunningDaemonMeta(info)
                    ? { meta: info.meta }
                    : { meta: undefined, metaReason: info.metaStatus }),
            }).data;
            daemons.push(entry);
            messages.push(`- ${daemonId}: running=${entry.running} pid=${entry.pid ?? 'n/a'}`);
        }
        messages.push(supervisorLine);
        return success({ messages, data: { projectName, daemons, supervisor } });
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
