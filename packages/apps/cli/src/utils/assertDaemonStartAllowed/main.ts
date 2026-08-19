import type { Failure, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import { hasRunningDaemonMeta, type RunningProjectDaemons } from '../listRunningProjectDaemons';

export type AssertDaemonStartAllowedFailure = {
    message: string;
    code?: 'daemonIdInUse' | 'daemonMetaCorrupt';
    reason?: 'missing' | 'invalid';
};

export function assertDaemonStartAllowed(input: {
    projectName: string;
    daemonId: string;
    running: RunningProjectDaemons;
    /** When set, a live pid file for this daemonId matching this pid is treated as this process. */
    selfPid?: number;
}): Success<void> | Failure<AssertDaemonStartAllowedFailure> {
    const { projectName, daemonId, running, selfPid } = input;

    for (const [peerId, info] of Object.entries(running)) {
        if (peerId === daemonId && selfPid !== undefined && info.pid === selfPid) {
            continue;
        }
        if (hasRunningDaemonMeta(info)) continue;
        return failure<AssertDaemonStartAllowedFailure>({
            code: 'daemonMetaCorrupt',
            reason: info.metaStatus,
            message:
                `Cannot start: daemon "${peerId}" for "${projectName}" is running (pid ${info.pid}) ` +
                `but its meta is invalid (reason: ${info.metaStatus}). ` +
                `Run \`lumpcode stop --daemonId ${peerId} --force\` first.`,
        });
    }

    const same = running[daemonId];
    if (same !== undefined && (selfPid === undefined || same.pid !== selfPid)) {
        return failure<AssertDaemonStartAllowedFailure>({
            code: 'daemonIdInUse',
            message:
                `Daemon id "${daemonId}" is already running for "${projectName}" (pid ${same.pid}). ` +
                `Run \`lumpcode stop --daemonId ${daemonId}\` first.`,
        });
    }

    return success(undefined);
}
