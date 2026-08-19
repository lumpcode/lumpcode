import { spawn as nodeSpawn } from 'node:child_process';
import * as z from 'zod';
import { CronPattern } from 'croner';

import { failure } from '@lumpcode/core';

import { DEFAULT_DAEMON_CRON_SETUP } from '../../consts';
import { Command, CommandHandlerMaker } from '../../types';
import type { ResolvedProjectLocalConfig } from '../../types/ResolvedProjectLocalConfig';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import {
    commandFailure,
    createCliLogger,
    daemonsDirPath,
    getProjectName,
    launchStartDaemon,
    listRunningProjectDaemons,
    parseLumpNameFilterPatterns,
    readProjectLocalConfig,
    resolveDaemonId,
    type LumpNameFilter,
} from '../../utils';
import { validateCurrentLumpProjectRoot } from '../../utils/validateCurrentLumpProjectRoot';

/** Default detached-daemon schedule; used by `start` and `restart`. */
export const defaultCronPattern = DEFAULT_DAEMON_CRON_SETUP;

const LUMP_NAME_START_DEPRECATION =
    '--lumpName is deprecated on start; use --include=<name> (and optional --daemonId) instead.';

const inputSchema = z.object({
    options: baseCommandOptionsSchema.extend({
        cronSetup: z
            .string()
            .optional()
            .describe(`Cron schedule (default "${defaultCronPattern}" — every 5 minutes)`),
        foreground: z
            .boolean()
            .optional()
            .describe('Run blocking in this terminal (omit to detach a background daemon)'),
        include: z
            .string()
            .optional()
            .describe('Comma-separated lump name patterns to include (exact or * globs)'),
        exclude: z
            .string()
            .optional()
            .describe('Comma-separated lump name patterns to exclude after include'),
        daemonId: z.string().optional().describe('Unique daemon id for PID/log/meta files'),
        maxParallelRun: z
            .number()
            .optional()
            .describe('Override local.json maxParallelRun for this worktree daemon'),
        lumpName: z
            .string()
            .optional()
            .describe('Deprecated: equivalent to --include=<name>'),
    }),
    arguments: z.object({}),
});

export type Input = z.infer<typeof inputSchema>;

export type Output = {
    messages: string[];
    data?: {
        cronSetup: string;
        lumpNames: string[];
        ticks: number;
        daemonId: string;
        include?: string[];
        exclude?: string[];
        maxParallelRun?: number;
    };
};

export interface Injections {
    projectRoot: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    /** When set (e.g. in tests), used instead of waiting for SIGINT/SIGTERM */
    waitForShutdownOverride?: () => Promise<void>;
    /** When set (e.g. in tests), used instead of `child_process.spawn` */
    spawnFn?: typeof nodeSpawn;
    /** Test-only: skip launching the project supervisor. */
    skipEnsureSupervisor?: boolean;
}

const handlerMaker: CommandHandlerMaker<Injections, Input, Output> = (injections) => async (input) => {
    const { projectRoot, localConfigFolderPath, globalConfigFolderPath, waitForShutdownOverride, spawnFn, skipEnsureSupervisor } =
        injections;
    const { json, verbose: cliVerbose } = input.options;
    const foreground = input.options.foreground === true;
    const cronSetup = input.options.cronSetup?.trim() || defaultCronPattern;
    const lumpNameOpt = input.options.lumpName?.trim() ? input.options.lumpName.trim() : undefined;
    const explicitDaemonId = input.options.daemonId?.trim() || undefined;
    const cliMaxParallelRun = input.options.maxParallelRun;
    const logger = createCliLogger({
        verbose: !!cliVerbose,
        json: !!json,
        prefix: '[lumpcode start]',
    });

    const validationResult = await validateCurrentLumpProjectRoot({ cwd: projectRoot });
    if (!validationResult.success) return commandFailure(validationResult.data);

    const localConfigResult = await readProjectLocalConfig({ localConfigFolderPath });
    if (!localConfigResult.success) return commandFailure(localConfigResult.data);
    const frozenLocalConfig: ResolvedProjectLocalConfig = localConfigResult.data;
    const workspaceStrategy = frozenLocalConfig.workspaceStrategy;

    if (lumpNameOpt && input.options.include !== undefined && input.options.include.trim() !== '') {
        return failure({
            messages: ['Pass only one of --lumpName and --include.'],
        });
    }
    if (lumpNameOpt) {
        logger.warn(LUMP_NAME_START_DEPRECATION);
    }

    const include = lumpNameOpt
        ? [lumpNameOpt]
        : parseLumpNameFilterPatterns(input.options.include);
    const exclude = parseLumpNameFilterPatterns(input.options.exclude);
    const filter: LumpNameFilter = {
        ...(include.length ? { include } : {}),
        ...(exclude.length ? { exclude } : {}),
    };

    if (cliMaxParallelRun !== undefined) {
        if (!Number.isInteger(cliMaxParallelRun) || cliMaxParallelRun < 1) {
            return failure({
                messages: ['--maxParallelRun must be a positive integer.'],
            });
        }
        if (workspaceStrategy === 'checkout') {
            return failure({
                messages: [
                    '--maxParallelRun requires workspaceStrategy "worktree" in local.json.',
                ],
            });
        }
    }

    try {
        new CronPattern(cronSetup);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return failure({
            messages: [`Invalid cron expression "${cronSetup}": ${msg}`],
        });
    }

    const nameResult = await getProjectName({ localConfigFolderPath, projectRoot });
    if (!nameResult.success) return commandFailure(nameResult.data);
    const projectName = nameResult.data;

    const runningResult = await listRunningProjectDaemons({
        daemonsDir: daemonsDirPath({ globalConfigFolderPath }),
        projectName,
    });
    if (!runningResult.success) {
        return failure({ messages: [runningResult.data] });
    }
    const existingDaemonIds = new Set(
        Object.entries(runningResult.data)
            .filter(([, info]) => info.pid !== process.pid)
            .map(([id]) => id),
    );

    const daemonIdResult = resolveDaemonId({
        explicitDaemonId,
        filter,
        existingDaemonIds,
    });
    if (!daemonIdResult.success) {
        return failure({ messages: [daemonIdResult.data] });
    }

    return launchStartDaemon({
        recipe: {
            projectRoot,
            daemonId: daemonIdResult.data,
            cronSetup,
            workspaceStrategy,
            include: include.length ? include : undefined,
            exclude: exclude.length ? exclude : undefined,
            maxParallelRun: cliMaxParallelRun,
        },
        frozenLocalConfig,
        localConfigFolderPath,
        globalConfigFolderPath,
        projectName,
        json: !!json,
        cliVerbose: !!cliVerbose,
        foreground,
        logger,
        waitForShutdownOverride,
        spawnFn,
        skipEnsureSupervisor,
        running: runningResult.data,
    });
};

export const command = {
    handlerMaker,
    name: 'start',
    description:
        'Detach a background scheduler that re-runs lumps on a cron schedule (PID under ~/.lumpcode/daemons/). Pass `--foreground` to run blocking in this terminal. Pass `--include` / `--exclude` to filter lumps and `--daemonId` to name the daemon.',
    inputSchema,
} satisfies Command;
