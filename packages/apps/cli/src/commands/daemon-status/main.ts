import * as z from 'zod';

import { failure, success } from '@lumpcode/core';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import {
    createCliLogger,
    daemonsDirPath,
    listRunningProjectDaemons,
    readDaemonMeta,
    readDaemonPidIfAlive,
    resolveDaemonCommandScope,
    resolveDaemonPaths,
    type DaemonMetaReadErrorReason,
    type RunningDaemonInfo,
} from '../../utils';
import { commandFailure } from '../../utils/commandFailure';
import { legacyBareGlobalDaemonLogPath } from '../../utils/daemonLogPath';
import { legacyBareGlobalDaemonMetaPath } from '../../utils/daemonMetaPath';
import { legacyBareGlobalDaemonPidPath } from '../../utils/daemonPidPath';
import { getProjectName } from '../../utils/getProjectName';
import { validateCurrentLumpProjectRoot } from '../../utils/validateCurrentLumpProjectRoot';

const inputSchema = z.object({
    options: baseCommandOptionsSchema.extend({
        daemonId: z.string().optional().describe('Inspect a single daemon by id'),
        lumpName: z
            .string()
            .optional()
            .describe('Deprecated. Treated as --daemonId for single-daemon detail'),
    }),
    arguments: z.object({}),
});

export type Input = z.infer<typeof inputSchema>;

export type DaemonStatusEntry = {
    daemonId: string;
    running: boolean;
    projectName: string;
    pidFilePath: string;
    logFilePath: string;
    metaFilePath: string;
    pid?: number;
    cronSetup?: string;
    include?: string[];
    exclude?: string[];
    workspaceStrategy?: string;
    maxParallelRun?: number;
    inFlightLumpCount?: number;
    stalePidFile?: boolean;
    metaStatus?: DaemonMetaReadErrorReason;
};

export type StatusData = DaemonStatusEntry;

export type Output = {
    messages: string[];
    data?:
        | DaemonStatusEntry
        | {
              daemons: DaemonStatusEntry[];
              projectName: string;
          };
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
          include?: string[];
          exclude?: string[];
          workspaceStrategy: string;
          maxParallelRun?: number;
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
    return {
        ok: true,
        ...(metaResult.data.cronSetup !== undefined ? { cronSetup: metaResult.data.cronSetup } : {}),
        ...(metaResult.data.include !== undefined ? { include: metaResult.data.include } : {}),
        ...(metaResult.data.exclude !== undefined ? { exclude: metaResult.data.exclude } : {}),
        ...(metaResult.data.maxParallelRun !== undefined
            ? { maxParallelRun: metaResult.data.maxParallelRun }
            : {}),
        ...(metaResult.data.daemonId !== undefined ? { daemonId: metaResult.data.daemonId } : {}),
        workspaceStrategy: metaResult.data.workspaceStrategy,
        inFlightLumpCount: metaResult.data.inFlightLumpCount ?? 0,
    };
}

function entryFromAlive(input: {
    daemonId: string;
    projectName: string;
    pidFilePath: string;
    logFilePath: string;
    metaFilePath: string;
    info: RunningDaemonInfo;
    meta: MetaRead;
}): DaemonStatusEntry {
    const { daemonId, projectName, pidFilePath, logFilePath, metaFilePath, info, meta } = input;
    return {
        daemonId,
        running: true,
        projectName,
        pidFilePath,
        logFilePath,
        metaFilePath,
        pid: info.pid,
        include: meta.ok ? (meta.include ?? []) : [],
        exclude: meta.ok ? (meta.exclude ?? []) : [],
        maxParallelRun: meta.ok ? meta.maxParallelRun : undefined,
        inFlightLumpCount: meta.ok ? meta.inFlightLumpCount : undefined,
        workspaceStrategy:
            meta.ok
                ? meta.workspaceStrategy
                : info.meta === 'ok'
                  ? info.workspaceStrategy
                  : undefined,
        ...(meta.ok && meta.cronSetup !== undefined ? { cronSetup: meta.cronSetup } : {}),
        ...(!meta.ok ? { metaStatus: meta.reason } : {}),
    };
}

async function buildSingleStatus(input: {
    daemonId: string;
    scopeLabel: string;
    projectName: string;
    pidFilePath: string;
    logFilePath: string;
    metaFilePath: string;
}): Promise<
    | { success: true; messages: string[]; data: DaemonStatusEntry }
    | { success: false; messages: string[] }
> {
    const { daemonId, scopeLabel, projectName, pidFilePath, logFilePath, metaFilePath } = input;
    const meta = await readMetaFromFile(metaFilePath);

    const pidAliveResult = await readDaemonPidIfAlive(pidFilePath);
    if (!pidAliveResult.success) {
        return { success: false, messages: [pidAliveResult.data] };
    }
    const pidAlive = pidAliveResult.data;
    if (pidAlive === undefined) {
        const messages: string[] = [
            `No Lumpcode background daemon PID file for "${projectName}"${scopeLabel} (${pidFilePath}). The daemon is not running.`,
        ];
        if (meta.ok && meta.cronSetup !== undefined) {
            messages.push(`Detached schedule on file: ${meta.cronSetup}`);
        }
        return {
            success: true,
            messages,
            data: {
                daemonId,
                running: false,
                projectName,
                pidFilePath,
                logFilePath,
                metaFilePath,
                include: meta.ok ? (meta.include ?? []) : [],
                exclude: meta.ok ? (meta.exclude ?? []) : [],
                maxParallelRun: meta.ok ? meta.maxParallelRun : undefined,
                inFlightLumpCount: meta.ok ? meta.inFlightLumpCount : 0,
                ...(meta.ok && meta.cronSetup !== undefined ? { cronSetup: meta.cronSetup } : {}),
                ...(meta.ok ? { workspaceStrategy: meta.workspaceStrategy } : {}),
                ...(!meta.ok ? { metaStatus: meta.reason } : {}),
            },
        };
    }

    if ('stale' in pidAlive) {
        const messages: string[] = [
            `PID file for "${projectName}"${scopeLabel} references a process that is not running (stale PID file at ${pidFilePath}).`,
        ];
        if (meta.ok && meta.cronSetup !== undefined) {
            messages.push(`Last recorded cron schedule: ${meta.cronSetup}`);
        }
        return {
            success: true,
            messages,
            data: {
                daemonId,
                running: false,
                projectName,
                pidFilePath,
                logFilePath,
                metaFilePath,
                stalePidFile: true,
                include: meta.ok ? (meta.include ?? []) : [],
                exclude: meta.ok ? (meta.exclude ?? []) : [],
                maxParallelRun: meta.ok ? meta.maxParallelRun : undefined,
                inFlightLumpCount: meta.ok ? meta.inFlightLumpCount : 0,
                ...(meta.ok && meta.cronSetup !== undefined ? { cronSetup: meta.cronSetup } : {}),
                ...(meta.ok ? { workspaceStrategy: meta.workspaceStrategy } : {}),
                ...(!meta.ok ? { metaStatus: meta.reason } : {}),
            },
        };
    }

    const pid = pidAlive.pid;

    if (!meta.ok) {
        return {
            success: true,
            messages: [
                `Lumpcode background daemon is running for "${projectName}"${scopeLabel} (pid ${pid}).`,
                `Log file: ${logFilePath}`,
                `Daemon meta is invalid (reason: ${meta.reason}) at ${metaFilePath}; run \`lumpcode stop --force\` to repair.`,
            ],
            data: {
                daemonId,
                running: true,
                projectName,
                pidFilePath,
                logFilePath,
                metaFilePath,
                pid,
                include: [],
                exclude: [],
                metaStatus: meta.reason,
            },
        };
    }

    const inFlightLumpCount = meta.inFlightLumpCount;
    const messages: string[] = [
        `Lumpcode background daemon is running for "${projectName}"${scopeLabel} (pid ${pid}).`,
        `Log file: ${logFilePath}`,
        `daemonId: ${daemonId}`,
    ];
    if (meta.cronSetup !== undefined) {
        messages.push(`Cron schedule: ${meta.cronSetup}`);
    } else {
        messages.push(
            'Cron schedule is not recorded in the daemon metadata file (restart with a current lumpcode to refresh it).',
        );
    }
    messages.push(`In-flight lump runs: ${inFlightLumpCount}`);

    return {
        success: true,
        messages,
        data: {
            daemonId,
            running: true,
            projectName,
            pidFilePath,
            logFilePath,
            metaFilePath,
            pid,
            include: meta.include ?? [],
            exclude: meta.exclude ?? [],
            ...(meta.cronSetup !== undefined ? { cronSetup: meta.cronSetup } : {}),
            workspaceStrategy: meta.workspaceStrategy,
            maxParallelRun: meta.maxParallelRun,
            inFlightLumpCount,
        },
    };
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

    if (lumpNameOpt !== undefined && daemonIdOpt === undefined) {
        logger.warn('--lumpName on daemon-status is deprecated; use --daemonId instead.');
    }

    const wantsSingle = daemonIdOpt !== undefined || lumpNameOpt !== undefined;

    if (wantsSingle) {
        const scopeResult = await resolveDaemonCommandScope({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            daemonId: daemonIdOpt,
            lumpName: lumpNameOpt,
        });
        if (!scopeResult.success) return scopeResult;
        const { daemonId, scopeLabel, paths } = scopeResult.data;
        const single = await buildSingleStatus({
            daemonId,
            scopeLabel,
            projectName: paths.projectName,
            pidFilePath: paths.pidFilePath,
            logFilePath: paths.logFilePath,
            metaFilePath: paths.metaFilePath,
        });
        if (!single.success) {
            return failure({ messages: single.messages });
        }
        return success({
            messages: single.messages,
            data: single.data,
        });
    }

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

    const daemons: DaemonStatusEntry[] = [];
    for (const [daemonId, info] of Object.entries(runningResult.data)) {
        const canonical = await resolveDaemonPaths({
            projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            daemonId,
        });
        if (!canonical.success) {
            return commandFailure(canonical.data);
        }

        let pidFilePath = canonical.data.pidFilePath;
        let metaFilePath = canonical.data.metaFilePath;
        let logFilePath = canonical.data.logFilePath;

        if (daemonId === 'global') {
            const newAlive = await readDaemonPidIfAlive(canonical.data.pidFilePath);
            const newOk =
                newAlive.success && newAlive.data !== undefined && !('stale' in newAlive.data);
            if (!newOk) {
                const legacyPid = legacyBareGlobalDaemonPidPath({ daemonsDir, projectName });
                const legacyAlive = await readDaemonPidIfAlive(legacyPid);
                if (
                    legacyAlive.success &&
                    legacyAlive.data !== undefined &&
                    !('stale' in legacyAlive.data)
                ) {
                    pidFilePath = legacyPid;
                    metaFilePath = legacyBareGlobalDaemonMetaPath({ daemonsDir, projectName });
                    logFilePath = legacyBareGlobalDaemonLogPath({ daemonsDir, projectName });
                }
            }
        }

        const meta = await readMetaFromFile(metaFilePath);
        daemons.push(
            entryFromAlive({
                daemonId,
                projectName,
                pidFilePath,
                logFilePath,
                metaFilePath,
                info,
                meta,
            }),
        );
    }

    daemons.sort((a, b) => a.daemonId.localeCompare(b.daemonId));

    const messages =
        daemons.length === 0
            ? [`No Lumpcode background daemons running for "${projectName}" (not running).`]
            : [
                  `Lumpcode daemons for "${projectName}" (${daemons.length}):`,
                  ...daemons.map(
                      (d) =>
                          `- ${d.daemonId}: pid ${d.pid ?? '?'} running=${d.running} inFlight=${d.inFlightLumpCount ?? 0}`,
                  ),
              ];

    return success({
        messages,
        data: {
            daemons,
            projectName,
        },
    });
};

export const command = {
    handlerMaker,
    name: 'daemon-status',
    description:
        'List all background daemons for this project, or show detail for one with --daemonId.',
    inputSchema,
} satisfies Command;
