import { failure, success, type Failure, type Logger, type Success } from '@lumpcode/core';

import {
    DAEMON_FORCE_STOP_WAIT_MS,
    DAEMON_IDLE_STOP_WAIT_MS,
    STOP_ALL_DRAIN_TIMEOUT_MS,
} from '../../consts';
import {
    daemonSchedulerFiles,
    drainOrStopOneDaemon,
    listDaemonIds,
    listRunningProjectDaemons,
    markStartDaemonDesiredStopping,
    pollUntil,
    stopSupervisor,
    supervisorMetaPath,
    supervisorPidPath,
    unlinkSchedulerFiles,
} from '../../utils';

export type StopAllProjectDaemonsInput = {
    projectName: string;
    daemonsDir: string;
    globalConfigFolderPath: string;
    force: boolean;
    logger: Logger;
    drainTimeoutMs?: number;
};

export type StopAllProjectDaemonsResult = {
    supervisorStopped: boolean;
};

/**
 * Mark every desired stopping, then `drainOrStopOneDaemon` per id
 * (mid-run daemons drain unless force). Poll leftovers, unlink, then
 * stop the supervisor (no busy/meta policy).
 */
export async function stopAllProjectDaemons(
    input: StopAllProjectDaemonsInput,
): Promise<Success<StopAllProjectDaemonsResult> | Failure<string>> {
    const {
        projectName,
        daemonsDir,
        globalConfigFolderPath,
        force,
        logger,
        drainTimeoutMs = STOP_ALL_DRAIN_TIMEOUT_MS,
    } = input;

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
    const ids = new Set([...desiredIdsResult.data, ...Object.keys(runningResult.data)]);
    const filesFor = (daemonId: string) => daemonSchedulerFiles({ daemonsDir, projectName, daemonId });

    for (const daemonId of ids) {
        const marked = await markStartDaemonDesiredStopping({
            desiredFilePath: filesFor(daemonId).desiredFilePath,
        });
        if (!marked.success) {
            logger.warn(`Could not mark "${daemonId}" stopping: ${marked.data}`);
        }
    }

    const waitMs = force ? DAEMON_FORCE_STOP_WAIT_MS : DAEMON_IDLE_STOP_WAIT_MS;
    for (const daemonId of ids) {
        const files = filesFor(daemonId);
        const stopped = await drainOrStopOneDaemon({
            pidFilePath: files.pidFilePath,
            metaFilePath: files.metaFilePath,
            desiredFilePath: files.desiredFilePath,
            force,
            waitMs,
            logger,
        });
        switch (stopped.status) {
            case 'stopped':
            case 'missing':
            case 'stale':
                break;
            case 'draining':
                logger.info(`daemon "${daemonId}" is mid-run; waiting for drain`);
                break;
            case 'failed':
                return failure(stopped.message);
            default: {
                const _exhaustive: never = stopped;
                return failure(String(_exhaustive));
            }
        }
    }

    const drainWaitMs = force ? DAEMON_FORCE_STOP_WAIT_MS : drainTimeoutMs;
    const drained = await pollUntil({
        timeoutMs: drainWaitMs,
        intervalMs: 200,
        poll: async () => {
            const still = await listRunningProjectDaemons({ daemonsDir, projectName });
            if (!still.success) return undefined;
            return Object.keys(still.data).length === 0 ? true : undefined;
        },
    });

    if (!drained) {
        return failure(
            'Timed out waiting for project daemons to exit. Run `lumpcode stop --all --force`.',
        );
    }

    for (const daemonId of ids) {
        await unlinkSchedulerFiles(filesFor(daemonId));
    }

    const supervisor = await stopSupervisor({
        pidFilePath: supervisorPidPath({ globalConfigFolderPath, projectName }),
        metaFilePath: supervisorMetaPath({ globalConfigFolderPath, projectName }),
        force,
        waitMs,
    });
    switch (supervisor.status) {
        case 'stopped':
            return success({ supervisorStopped: true });
        case 'missing':
        case 'stale':
            return success({ supervisorStopped: false });
        case 'failed':
            logger.warn(supervisor.message);
            return success({ supervisorStopped: false });
        default: {
            const _exhaustive: never = supervisor;
            return _exhaustive;
        }
    }
}
