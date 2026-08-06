import type { Failure, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import type { RunningDaemonInfo, RunningProjectDaemons } from '../listRunningProjectDaemons';

export type AssertDaemonStartAllowedFailure = {
    message: string;
    code?: 'daemonIdInUse' | 'daemonMetaCorrupt';
    reason?: 'missing' | 'invalid';
};

export function assertDaemonStartAllowed(input: {
    projectName: string;
    daemonId: string;
    running: RunningProjectDaemons;
}): Success<void> | Failure<AssertDaemonStartAllowedFailure> {
    const { projectName, daemonId, running } = input;

    for (const [peerId, info] of Object.entries(running)) {
        if (info.meta === 'ok') continue;
        return failure<AssertDaemonStartAllowedFailure>({
            code: 'daemonMetaCorrupt',
            reason: info.meta,
            message:
                `Cannot start: daemon "${peerId}" for "${projectName}" is running (pid ${info.pid}) ` +
                `but its meta is invalid (reason: ${info.meta}). ` +
                `Run \`lumpcode stop --daemonId ${peerId} --force\` first.`,
        });
    }

    const same = running[daemonId] as RunningDaemonInfo | undefined;
    if (same !== undefined) {
        return failure<AssertDaemonStartAllowedFailure>({
            code: 'daemonIdInUse',
            message:
                `Daemon id "${daemonId}" is already running for "${projectName}" (pid ${same.pid}). ` +
                `Run \`lumpcode stop --daemonId ${daemonId}\` first.`,
        });
    }

    return success(undefined);
}
