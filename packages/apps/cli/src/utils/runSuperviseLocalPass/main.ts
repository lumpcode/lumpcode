import { spawn as nodeSpawn } from 'node:child_process';
import * as path from 'node:path';

import { killProcessTree, type Logger, success, type Failure, type Success } from '@lumpcode/core';

import { daemonSchedulerFiles, listDaemonIds, unlinkSchedulerFiles } from '../daemonSchedulerFiles';
import { getProjectName } from '../getProjectName';
import { listRunningProjectDaemons, hasRunningDaemonMeta } from '../listRunningProjectDaemons';
import { readDaemonMeta } from '../readDaemonMeta';
import { spawnDetachedLumpcodeWithPidFile } from '../spawnDetachedLumpcodeWithPidFile';
import {
    fromMeta,
    recipeFromDesired,
    readStartDaemonDesired,
    toForegroundArgs,
    toMetaWrite,
    writeStartDaemonDesired,
    type StartDaemonDesired,
} from '../startDaemonDesired';

export type RunSuperviseLocalPassInput = {
    projectName: string;
    projectRoot: string;
    daemonsDir: string;
    logger: Logger;
    spawnFn?: typeof nodeSpawn;
};

async function adoptRunningDaemon(input: {
    projectRoot: string;
    daemonsDir: string;
    projectName: string;
    daemonId: string;
    logger: Logger;
}): Promise<void> {
    const { projectRoot, daemonsDir, projectName, daemonId, logger } = input;
    const { desiredFilePath, metaFilePath } = daemonSchedulerFiles({
        daemonsDir,
        projectName,
        daemonId,
    });
    const metaResult = await readDaemonMeta(metaFilePath);
    if (!metaResult.success) {
        return;
    }
    const desired = fromMeta(metaResult.data, { projectRoot, daemonId });
    const writeDesired = await writeStartDaemonDesired({ desiredFilePath, desired });
    if (!writeDesired.success) {
        logger.error(`adopt "${daemonId}": ${writeDesired.data}`);
        return;
    }
    logger.info(`adopted running daemon "${daemonId}" into desired.json`);
}

async function orphanKillDaemon(input: {
    daemonsDir: string;
    projectName: string;
    daemonId: string;
    pid: number;
    logger: Logger;
}): Promise<void> {
    const { daemonsDir, projectName, daemonId, pid, logger } = input;
    logger.info(`orphan-killing daemon "${daemonId}" (pid ${pid})`);
    const killResult = await killProcessTree({ pid, graceMs: 0 });
    if (!killResult.success) {
        logger.error(`orphan kill "${daemonId}" pid ${pid}: ${killResult.data}`);
        return;
    }
    const { pidFilePath, metaFilePath } = daemonSchedulerFiles({ daemonsDir, projectName, daemonId });
    await unlinkSchedulerFiles({ pidFilePath, metaFilePath });
}

async function spawnDesiredDaemon(input: {
    projectName: string;
    daemonsDir: string;
    desired: StartDaemonDesired;
    logger: Logger;
    spawnFn?: typeof nodeSpawn;
}): Promise<void> {
    const { projectName, daemonsDir, desired, logger, spawnFn } = input;
    const localConfigFolderPath = path.join(desired.projectRoot, '.lumpcode');
    const nameResult = await getProjectName({
        localConfigFolderPath,
        projectRoot: desired.projectRoot,
    });
    if (!nameResult.success || nameResult.data !== projectName) {
        logger.warn(
            `skip spawn for "${desired.daemonId}": project.json name ${JSON.stringify(nameResult.data)} does not match filename project "${projectName}"`,
        );
        return;
    }

    const { pidFilePath, logFilePath, metaFilePath } = daemonSchedulerFiles({
        daemonsDir,
        projectName,
        daemonId: desired.daemonId,
    });
    const metaResult = await readDaemonMeta(metaFilePath);
    if (!metaResult.success) {
        logger.warn(
            `skip spawn for "${desired.daemonId}": meta ${metaResult.data.reason} (${metaResult.data.message})`,
        );
        return;
    }

    const recipe = recipeFromDesired(desired, metaResult.data.workspaceStrategy);
    const spawnResult = await spawnDetachedLumpcodeWithPidFile({
        extraArgs: toForegroundArgs(recipe),
        cwd: desired.projectRoot,
        logFilePath,
        pidFilePath,
        spawnFn,
        stubMeta: {
            filePath: metaFilePath,
            data: toMetaWrite(recipe),
        },
        logger,
    });
    if (!spawnResult.success) {
        logger.error(`spawn "${desired.daemonId}": ${spawnResult.data}`);
    }
}

/**
 * One local reconcile pass: adopt / orphan-kill / spawn / drain leftover desired files.
 */
export async function runSuperviseLocalPass(
    input: RunSuperviseLocalPassInput,
): Promise<Success<void> | Failure<string>> {
    const { projectName, projectRoot, daemonsDir, logger, spawnFn } = input;

    const desiredIdsResult = await listDaemonIds({
        dir: daemonsDir,
        projectName,
        kind: 'desired',
    });
    if (!desiredIdsResult.success) {
        return desiredIdsResult;
    }
    const runningResult = await listRunningProjectDaemons({ daemonsDir, projectName });
    if (!runningResult.success) {
        return runningResult;
    }

    const desiredIds = new Set(desiredIdsResult.data);
    const running = runningResult.data;

    for (const [daemonId, info] of Object.entries(running)) {
        if (desiredIds.has(daemonId)) continue;
        const canAdopt = hasRunningDaemonMeta(info);
        if (canAdopt) {
            await adoptRunningDaemon({
                projectRoot,
                daemonsDir,
                projectName,
                daemonId,
                logger,
            });
            continue;
        }
        await orphanKillDaemon({
            daemonsDir,
            projectName,
            daemonId,
            pid: info.pid,
            logger,
        });
    }

    for (const daemonId of desiredIdsResult.data) {
        const { desiredFilePath, pidFilePath, metaFilePath } = daemonSchedulerFiles({
            daemonsDir,
            projectName,
            daemonId,
        });
        const desiredResult = await readStartDaemonDesired(desiredFilePath);
        if (!desiredResult.success) {
            logger.warn(`desired "${daemonId}": ${desiredResult.data}`);
            continue;
        }
        if (desiredResult.data === undefined) {
            continue;
        }
        const desired = desiredResult.data;
        const live = running[daemonId] !== undefined;
        if (desired.stopping === true) {
            if (!live) {
                await unlinkSchedulerFiles({ pidFilePath, metaFilePath, desiredFilePath });
            }
            continue;
        }
        if (live) {
            continue;
        }
        await spawnDesiredDaemon({
            projectName,
            daemonsDir,
            desired,
            logger,
            spawnFn,
        });
    }

    return success(undefined);
}
