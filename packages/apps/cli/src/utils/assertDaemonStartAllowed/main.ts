import type { Failure, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import type { RunningDaemonInfo, RunningProjectDaemons } from '../listRunningProjectDaemons';

function asRunningEntries(
    running: ReadonlyMap<string, RunningDaemonInfo> | RunningProjectDaemons,
): Array<[string, RunningDaemonInfo]> {
    if (running instanceof Map) {
        return [...running.entries()];
    }
    return Object.entries(running);
}

function findCorruptDaemon(
    running: ReadonlyMap<string, RunningDaemonInfo> | RunningProjectDaemons,
): { daemonId: string; info: Extract<RunningDaemonInfo, { meta: 'missing' | 'invalid' }> } | undefined {
    for (const [daemonId, info] of asRunningEntries(running)) {
        if (info.meta !== 'ok') {
            return { daemonId, info };
        }
    }
    return undefined;
}

function lookupRunning(
    running: ReadonlyMap<string, RunningDaemonInfo> | RunningProjectDaemons,
    daemonId: string,
): RunningDaemonInfo | undefined {
    if (running instanceof Map) {
        return running.get(daemonId);
    }
    return (running as RunningProjectDaemons)[daemonId];
}

export type AssertDaemonStartAllowedFailure = {
    message: string;
    code?: 'daemonIdInUse' | 'daemonMetaCorrupt';
    reason?: 'missing' | 'invalid';
};

/**
 * Start is allowed when the daemonId is free and no alive peer has corrupt/missing meta.
 * Filter overlap and checkout peer count are not gated here (locks coordinate at runtime).
 */
export function assertDaemonStartAllowed(input: {
    projectName: string;
    daemonId: string;
    running: ReadonlyMap<string, RunningDaemonInfo> | RunningProjectDaemons;
}): Success<void> | Failure<AssertDaemonStartAllowedFailure> {
    const { projectName, daemonId, running } = input;

    const corrupt = findCorruptDaemon(running);
    if (corrupt !== undefined) {
        return failure<AssertDaemonStartAllowedFailure>({
            code: 'daemonMetaCorrupt',
            reason: corrupt.info.meta,
            message:
                `Cannot start: daemon "${corrupt.daemonId}" for "${projectName}" is running ` +
                `(pid ${corrupt.info.pid}) but its meta is invalid (reason: ${corrupt.info.meta}). ` +
                `Run \`lumpcode stop --daemonId ${corrupt.daemonId} --force\` first.`,
        });
    }

    const existing = lookupRunning(running, daemonId);
    if (existing !== undefined) {
        return failure<AssertDaemonStartAllowedFailure>({
            code: 'daemonIdInUse',
            message:
                `daemonIdInUse: daemon id "${daemonId}" is already running for "${projectName}" ` +
                `(pid ${existing.pid}). Run \`lumpcode stop --daemonId ${daemonId}\` first.`,
        });
    }

    return success(undefined);
}
