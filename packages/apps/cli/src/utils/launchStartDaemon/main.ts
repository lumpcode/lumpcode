import { spawn as nodeSpawn } from 'node:child_process';

import { failure, success, type Failure, type Logger, type Success } from '@lumpcode/core';

import type { ResolvedProjectLocalConfig } from '../../types/ResolvedProjectLocalConfig';
import { assertDaemonStartAllowed } from '../assertDaemonStartAllowed';
import { RESERVED_DAEMON_ID } from '../daemonFileBaseName';
import { daemonSchedulerFiles } from '../daemonSchedulerFiles';
import { daemonsDirPath } from '../daemonsDirPath';
import { discoverLoadableLumps } from '../discoverLoadableLumpNames';
import { ensureProjectSupervisor } from '../ensureProjectSupervisor';
import { filterLumpNames, isLumpNameFilterActive } from '../filterLumpNames';
import { listRunningProjectDaemons, type RunningProjectDaemons } from '../listRunningProjectDaemons';
import { spawnDetachedLumpcodeWithPidFile } from '../spawnDetachedLumpcodeWithPidFile';
import {
    toDesired,
    toForegroundArgs,
    toMetaWrite,
    writeStartDaemonDesired,
    type StartDaemonRecipe,
} from '../startDaemonDesired';
import { runForegroundStartDaemon } from './runForeground';

export type LaunchStartDaemonOutput = {
    messages: string[];
    data: {
        cronSetup: string;
        lumpNames: string[];
        ticks: number;
        daemonId: string;
        include?: string[];
        exclude?: string[];
        maxParallelRun?: number;
    };
};

export type LaunchStartDaemonFailure = {
    messages: string[];
    data?: {
        code: 'daemonIdInUse' | 'daemonMetaCorrupt';
        reason?: 'missing' | 'invalid';
    };
};

export type LaunchStartDaemonInput = {
    recipe: StartDaemonRecipe;
    frozenLocalConfig: ResolvedProjectLocalConfig;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    projectName: string;
    json: boolean;
    cliVerbose: boolean;
    foreground: boolean;
    logger: Logger;
    waitForShutdownOverride?: () => Promise<void>;
    spawnFn?: typeof nodeSpawn;
    skipEnsureSupervisor?: boolean;
    running?: RunningProjectDaemons;
};

function startOutputData(
    recipe: StartDaemonRecipe,
    extra: { ticks: number; lumpNames: string[] },
): LaunchStartDaemonOutput['data'] {
    return {
        cronSetup: recipe.cronSetup,
        lumpNames: extra.lumpNames,
        ticks: extra.ticks,
        daemonId: recipe.daemonId,
        include: recipe.include,
        exclude: recipe.exclude,
        maxParallelRun: recipe.maxParallelRun,
    };
}

/** Write desired, spawn or run foreground. Shared by `start` and `restart`. */
export async function launchStartDaemon(
    input: LaunchStartDaemonInput,
): Promise<Success<LaunchStartDaemonOutput> | Failure<LaunchStartDaemonFailure>> {
    const {
        recipe,
        frozenLocalConfig,
        localConfigFolderPath,
        globalConfigFolderPath,
        projectName,
        json,
        cliVerbose,
        foreground,
        logger,
        waitForShutdownOverride,
        spawnFn,
        skipEnsureSupervisor,
        running,
    } = input;
    const { pidFilePath, logFilePath, metaFilePath, desiredFilePath } = daemonSchedulerFiles({
        daemonsDir: daemonsDirPath({ globalConfigFolderPath }),
        projectName,
        daemonId: recipe.daemonId,
    });

    let runningDaemons = running;
    if (runningDaemons === undefined) {
        const runningResult = await listRunningProjectDaemons({
            daemonsDir: daemonsDirPath({ globalConfigFolderPath }),
            projectName,
        });
        if (!runningResult.success) {
            return failure({ messages: [runningResult.data] });
        }
        runningDaemons = runningResult.data;
    }
    const startAllowed = assertDaemonStartAllowed({
        projectName,
        daemonId: recipe.daemonId,
        running: runningDaemons,
        selfPid: process.pid,
    });
    if (!startAllowed.success) {
        return failure({
            messages: [startAllowed.data.message],
            ...(startAllowed.data.code !== undefined
                ? {
                      data: {
                          code: startAllowed.data.code,
                          ...(startAllowed.data.reason !== undefined
                              ? { reason: startAllowed.data.reason }
                              : {}),
                      },
                  }
                : {}),
        });
    }

    if (!skipEnsureSupervisor) {
        const supervisorResult = await ensureProjectSupervisor({
            projectRoot: recipe.projectRoot,
            projectName,
            globalConfigFolderPath,
            spawnFn,
            logger,
        });
        if (!supervisorResult.success) {
            return failure({ messages: [supervisorResult.data] });
        }
    }

    const include = recipe.include ?? [];
    const exclude = recipe.exclude ?? [];
    const loadableAtStart = await discoverLoadableLumps({ localConfigFolderPath, logger });
    const initialLumps = filterLumpNames({
        names: loadableAtStart.map((lump) => lump.lumpName),
        include: recipe.include,
        exclude: recipe.exclude,
    });
    if (isLumpNameFilterActive({ include: recipe.include, exclude: recipe.exclude }) && initialLumps.length === 0) {
        logger.warn(
            'No lumps matched include/exclude at start; daemon will idle until a match appears.',
        );
    }

    const desiredWrite = await writeStartDaemonDesired({
        desiredFilePath,
        desired: toDesired(recipe),
    });
    if (!desiredWrite.success) {
        return failure({ messages: [desiredWrite.data] });
    }

    if (!foreground) {
        const spawnResult = await spawnDetachedLumpcodeWithPidFile({
            extraArgs: toForegroundArgs(recipe, {
                json: json === true,
                verbose: cliVerbose === true,
            }),
            cwd: recipe.projectRoot,
            logFilePath,
            pidFilePath,
            spawnFn: spawnFn ?? nodeSpawn,
            stubMeta: { filePath: metaFilePath, data: toMetaWrite(recipe) },
            logger,
        });
        if (!spawnResult.success) {
            return failure({ messages: [spawnResult.data] });
        }

        const stopHint =
            recipe.daemonId === RESERVED_DAEMON_ID
                ? '`lumpcode stop`'
                : `\`lumpcode stop --daemonId ${recipe.daemonId}\``;
        const filterDesc = isLumpNameFilterActive({ include: recipe.include, exclude: recipe.exclude })
            ? `Filter: include=${include.join(',') || '*'} exclude=${exclude.join(',') || '(none)'}.`
            : 'Filter: all loadable lumps.';

        return success({
            messages: [
                `Lumpcode daemon started. daemonId="${recipe.daemonId}". PID file: ${pidFilePath}. Logs: ${logFilePath}.`,
                `Project: "${projectName}". ${filterDesc} Run ${stopHint} to stop.`,
            ],
            data: startOutputData(recipe, { ticks: 0, lumpNames: initialLumps }),
        });
    }

    return runForegroundStartDaemon({
        recipe,
        paths: { pidFilePath, metaFilePath, desiredFilePath },
        frozenLocalConfig,
        localConfigFolderPath,
        globalConfigFolderPath,
        projectName,
        json,
        cliVerbose,
        logger,
        initialLumps,
        waitForShutdownOverride,
    });
}
