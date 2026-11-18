import { killSystemdScope, nodeErrnoCode, type Logger } from '@lumpcode/core';

import { readDaemonMeta } from '../readDaemonMeta';

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
 * Call only once the daemon pid is dead, and before deleting its meta.
 * Best effort: failures are logged, never returned. No-op on Windows.
 */
export async function killDaemonLeftovers(input: {
    daemonPid: number;
    metaFilePath: string;
    label: string;
    logger?: Logger;
}): Promise<void> {
    if (process.platform === 'win32') return;
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
