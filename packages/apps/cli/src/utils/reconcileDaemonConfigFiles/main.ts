import { spawn as nodeSpawn } from 'node:child_process';

import {
    execAsync,
    failure,
    success,
    type Failure,
    type Logger,
    type Success,
} from '@lumpcode/core';

import {
    DAEMON_CONFIG_RECONCILE_LOCK_HOLDER,
    DEFAULT_DAEMON_CRON_SETUP,
    DISCOVERY_GIT_TIMEOUT_MS,
} from '../../consts';
import type { ResolvedProjectLocalConfig } from '../../types/ResolvedProjectLocalConfig';
import { daemonsDirPath } from '../daemonsDirPath';
import type { ConsideredDaemonConfig } from '../discoverDaemonConfigFiles';
import { discoverDaemonConfigFiles } from '../discoverDaemonConfigFiles';
import { expandPrimaryBranches } from '../expandPrimaryBranches';
import {
    acquireGitCommonDirLock,
    isGitCommonDirBusyError,
} from '../gitCommonDirLock';
import { launchStartDaemon } from '../launchStartDaemon';
import {
    hasRunningDaemonMeta,
    listRunningProjectDaemons,
    type RunningDaemonInfo,
    type RunningProjectDaemons,
} from '../listRunningProjectDaemons';
import type { StartDaemonRecipe } from '../startDaemonDesired';

export type ReconcileDaemonConfigFilesOutput = {
    /**
     * When true, supervise should set nextDueAt = now + 5 min.
     * When false, leave nextDueAt (retry on the next 30s keep-alive).
     */
    advanced: boolean;
};

export type ReconcileDaemonConfigFilesInput = {
    projectRoot: string;
    projectName: string;
    /** Merged project/local snapshot from supervise start (not re-read). */
    frozenLocalConfig: ResolvedProjectLocalConfig;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    logger: Logger;
    json?: boolean;
    cliVerbose?: boolean;
    spawnFn?: typeof nodeSpawn;
};

function recipeFromConsidered(input: {
    considered: ConsideredDaemonConfig;
    projectRoot: string;
    workspaceStrategy: ResolvedProjectLocalConfig['workspaceStrategy'];
    localMaxParallelRun: number | undefined;
}): StartDaemonRecipe {
    const { considered, projectRoot, workspaceStrategy, localMaxParallelRun } = input;
    const include =
        considered.parsed.include !== undefined && considered.parsed.include.length > 0
            ? considered.parsed.include
            : undefined;
    const exclude =
        considered.parsed.exclude !== undefined && considered.parsed.exclude.length > 0
            ? considered.parsed.exclude
            : undefined;
    const maxParallelRun = considered.parsed.maxParallelRun ?? localMaxParallelRun;
    return {
        projectRoot,
        daemonId: considered.daemonId,
        cronSetup: considered.parsed.cronSetup ?? DEFAULT_DAEMON_CRON_SETUP,
        workspaceStrategy,
        include,
        exclude,
        ...(maxParallelRun !== undefined ? { maxParallelRun } : {}),
        daemonConfigFile: {
            hash: considered.hash,
            discoveryBranch: considered.effectiveDiscoveryBranch,
            path: considered.path,
        },
    };
}

function isFileLaunched(info: RunningDaemonInfo): boolean {
    return hasRunningDaemonMeta(info) && info.meta.daemonConfigFile !== undefined;
}

async function applyStarts(input: {
    considered: ConsideredDaemonConfig[];
    running: RunningProjectDaemons;
    projectRoot: string;
    projectName: string;
    frozenLocalConfig: ResolvedProjectLocalConfig;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    logger: Logger;
    json: boolean;
    cliVerbose: boolean;
    spawnFn?: typeof nodeSpawn;
}): Promise<void> {
    const {
        considered,
        running,
        projectRoot,
        projectName,
        frozenLocalConfig,
        localConfigFolderPath,
        globalConfigFolderPath,
        logger,
        json,
        cliVerbose,
        spawnFn,
    } = input;
    const workspaceStrategy = frozenLocalConfig.workspaceStrategy;
    const startedThisPass = new Set<string>();

    for (const entry of considered) {
        if (entry.parsed.disabled === true) {
            continue;
        }

        if (startedThisPass.has(entry.daemonId)) {
            continue;
        }

        const live = running[entry.daemonId];
        if (live !== undefined) {
            if (isFileLaunched(live)) {
                // Ticket 06: hash-restart / stop. Same-hash no-op for now.
                continue;
            }
            logger.error(
                `reconcileDaemonConfigFiles: daemonId "${entry.daemonId}" is already running ` +
                    `without daemonConfigFile meta (pid ${live.pid}); skipping file recipe ` +
                    `(${entry.path} on ${entry.effectiveDiscoveryBranch})`,
            );
            continue;
        }

        if (workspaceStrategy === 'checkout' && entry.parsed.maxParallelRun !== undefined) {
            logger.error(
                `reconcileDaemonConfigFiles: daemonId "${entry.daemonId}" sets maxParallelRun ` +
                    `but workspaceStrategy is "checkout"; not starting (${entry.path})`,
            );
            continue;
        }

        const recipe = recipeFromConsidered({
            considered: entry,
            projectRoot,
            workspaceStrategy,
            localMaxParallelRun: frozenLocalConfig.maxParallelRun,
        });
        const launchResult = await launchStartDaemon({
            recipe,
            frozenLocalConfig,
            localConfigFolderPath,
            globalConfigFolderPath,
            projectName,
            json,
            cliVerbose,
            foreground: false,
            logger,
            spawnFn,
            skipEnsureSupervisor: true,
            running,
        });
        if (!launchResult.success) {
            logger.error(
                `reconcileDaemonConfigFiles: failed to start "${entry.daemonId}": ${launchResult.data.messages.join(' ')}`,
            );
            continue;
        }
        logger.info(
            `reconcileDaemonConfigFiles: started file daemon "${entry.daemonId}" from ${entry.path} ` +
                `(${entry.effectiveDiscoveryBranch})`,
        );
        startedThisPass.add(entry.daemonId);
    }
}

/**
 * Dedicated supervise pass: fetch origin, discover considered repo daemon recipes,
 * then start enabled winners that are not already running.
 * Holds `gitCommonDirLock` only for fetch + discover; releases before spawn.
 */
export async function reconcileDaemonConfigFiles(
    input: ReconcileDaemonConfigFilesInput,
): Promise<Success<ReconcileDaemonConfigFilesOutput> | Failure<string>> {
    const {
        projectRoot,
        projectName,
        frozenLocalConfig,
        localConfigFolderPath,
        globalConfigFolderPath,
        logger,
        json = false,
        cliVerbose = false,
        spawnFn,
    } = input;

    // Specified no-op (shared / machine-disabled). Not a Failure: supervise would
    // stay-due and retry every keep-alive on a frozen snapshot that cannot change.
    // Supervise already skips the call (`fileReconcileEnabled`); this is the util guard.
    if (frozenLocalConfig.mode !== 'dedicated' || frozenLocalConfig.disabled === true) {
        return success({ advanced: true });
    }

    const lockResult = await acquireGitCommonDirLock({
        globalConfigFolderPath,
        gitCwd: projectRoot,
        lumpName: DAEMON_CONFIG_RECONCILE_LOCK_HOLDER,
        lockMode: 'fail',
        projectName,
        logger,
    });
    if (!lockResult.success) {
        if (isGitCommonDirBusyError(lockResult.data)) {
            logger.info(
                'reconcileDaemonConfigFiles: git common dir busy; staying due for next keep-alive',
            );
            return success({ advanced: false });
        }
        return failure(lockResult.data);
    }
    const releaseLock = lockResult.data;

    let considered: ConsideredDaemonConfig[];
    try {
        const fetchResult = await execAsync('git fetch --prune --no-write-fetch-head origin', {
            cwd: projectRoot,
            timeoutMillis: DISCOVERY_GIT_TIMEOUT_MS,
        });
        if (!fetchResult.success) {
            logger.warn(
                `reconcileDaemonConfigFiles: fetch failed: ${fetchResult.data.message}; staying due`,
            );
            return success({ advanced: false });
        }

        const expandResult = await expandPrimaryBranches({
            localConfig: frozenLocalConfig,
            cwd: projectRoot,
            logger,
        });
        if (!expandResult.success) {
            logger.warn(
                `reconcileDaemonConfigFiles: expandPrimaryBranches failed: ${expandResult.data}; staying due`,
            );
            return success({ advanced: false });
        }

        const discoverResult = await discoverDaemonConfigFiles({
            cwd: projectRoot,
            effectiveDiscoveryBranches: expandResult.data,
            logger,
        });
        considered = discoverResult.data;
    } finally {
        await releaseLock();
    }

    const runningResult = await listRunningProjectDaemons({
        daemonsDir: daemonsDirPath({ globalConfigFolderPath }),
        projectName,
    });
    if (!runningResult.success) {
        logger.warn(
            `reconcileDaemonConfigFiles: listRunningProjectDaemons failed: ${runningResult.data}; staying due`,
        );
        return success({ advanced: false });
    }

    await applyStarts({
        considered,
        running: runningResult.data,
        projectRoot,
        projectName,
        frozenLocalConfig,
        localConfigFolderPath,
        globalConfigFolderPath,
        logger,
        json,
        cliVerbose,
        spawnFn,
    });

    // Snapshot taken: collisions / skip-start do not stay due (ticket 06 adds daemonBusy stay-due).
    return success({ advanced: true });
}
