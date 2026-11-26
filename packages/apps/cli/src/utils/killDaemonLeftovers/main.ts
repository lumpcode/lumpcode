import { isProcessAlive, killSystemdScope, nodeErrnoCode, type Logger } from '@lumpcode/core';

import { removeGitCommonDirLocksHeldByDeadPid } from '../gitCommonDirLock';
import { pollUntil } from '../pollUntil';
import { readDaemonMeta } from '../readDaemonMeta';
import { removeWorkspacePathLocksHeldByDeadPid } from '../workspacePathLock';

/** How long to wait for a SIGKILLed daemon pid to disappear before cleaning its locks. */
const DEAD_PID_WAIT_MS = 2_000;

function killGroupBestEffort(input: { pgid: number; label: string; logger?: Logger }): void {
    const { pgid, label, logger } = input;
    try {
        process.kill(-pgid, 'SIGKILL');
    } catch (error: unknown) {
        if (nodeErrnoCode(error) === 'ESRCH') return;
        const message = error instanceof Error ? error.message : String(error);
        logger?.warn(`process group kill for ${label} pgid ${pgid} failed: ${message}`);
    }
}

/**
 * SIGKILLs what a daemon that died without cleaning up (SIGKILL, OOM,
 * `stop --force`) can leave behind:
 * - its own process group: `start` detaches, so the daemon pid is the group id
 *   and step children (systemd-scoped steps included) stay in that group;
 * - the step process groups and systemd scopes it published in its meta, which
 *   also hold processes that left the daemon's tree or group.
 * Then, once the daemon pid is gone (SIGKILL may still be landing), removes the workspace path
 * and git common dir locks it held, so they free at once instead of on the next contender's
 * listing. If the pid is still alive after a short wait, lock cleanup is skipped: those locks
 * free when a contender later finds the pid dead.
 * Call only once the daemon pid is dead or SIGKILLed, and before deleting its meta.
 * Best effort: failures are logged, never returned. Process kills are a no-op on Windows.
 */
export async function killDaemonLeftovers(input: {
    daemonPid: number;
    metaFilePath: string;
    globalConfigFolderPath: string;
    label: string;
    logger?: Logger;
}): Promise<void> {
    const { daemonPid, globalConfigFolderPath, logger } = input;
    if (process.platform !== 'win32') {
        await killDaemonProcessLeftovers(input);
    }
    if (!Number.isInteger(daemonPid) || daemonPid <= 1) return;
    const dead = await pollUntil({
        timeoutMs: DEAD_PID_WAIT_MS,
        intervalMs: 50,
        poll: () => !isProcessAlive(daemonPid, { onProbeError: 'alive' }),
    });
    if (dead !== true) {
        logger?.warn(`daemon pid ${daemonPid} still alive after ${DEAD_PID_WAIT_MS}ms; leaving its locks`);
        return;
    }
    await removeWorkspacePathLocksHeldByDeadPid({ globalConfigFolderPath, pid: daemonPid, logger });
    await removeGitCommonDirLocksHeldByDeadPid({ globalConfigFolderPath, pid: daemonPid, logger });
}

async function killDaemonProcessLeftovers(input: {
    daemonPid: number;
    metaFilePath: string;
    label: string;
    logger?: Logger;
}): Promise<void> {
    const { daemonPid, metaFilePath, label, logger } = input;
    if (Number.isInteger(daemonPid) && daemonPid > 1) {
        killGroupBestEffort({ pgid: daemonPid, label, logger });
    }

    const meta = await readDaemonMeta(metaFilePath);
    if (!meta.success) return;
    for (const pgid of meta.data.stepProcessGroups ?? []) {
        logger?.info(`killing step process group ${pgid} left by ${label}`);
        killGroupBestEffort({ pgid, label, logger });
    }
    for (const unitName of meta.data.stepSystemdScopes ?? []) {
        logger?.info(`killing step scope ${unitName} left by ${label}`);
        const killed = await killSystemdScope({ unitName });
        if (!killed.success) logger?.warn(killed.data);
    }
}
