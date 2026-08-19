import {
    failure,
    isProcessAlive,
    killProcessTree,
    nodeErrnoCode,
    success,
    type Failure,
    type Logger,
    type Success,
} from '@lumpcode/core';

import { pollUntil } from '../pollUntil';
import { isDaemonMidRun, readDaemonMeta, type DaemonMetaReadErrorReason } from '../readDaemonMeta';
import { readDaemonPidIfAlive } from '../readDaemonPidIfAlive';
import { markStartDaemonDesiredStopping } from '../startDaemonDesired';
import { unlinkBestEffort } from '../unlinkBestEffort';

async function waitForPidExit(input: { pid: number; waitMs: number }): Promise<boolean> {
    const dead = await pollUntil({
        timeoutMs: input.waitMs,
        intervalMs: 50,
        poll: () => (!isProcessAlive(input.pid, { onProbeError: 'dead' }) ? true : undefined),
    });
    return dead === true;
}

async function signalDaemonProcess(input: {
    pid: number;
    force: boolean;
}): Promise<Success<void> | Failure<string>> {
    const { pid, force } = input;
    if (force) {
        const killResult = await killProcessTree({ pid, graceMs: 0 });
        if (!killResult.success) {
            return killResult;
        }
        return success(undefined);
    }
    try {
        process.kill(pid, 'SIGTERM');
        return success(undefined);
    } catch (e) {
        if (nodeErrnoCode(e) === 'ESRCH') {
            return success(undefined);
        }
        return failure(`Could not signal process (pid ${pid}): ${String(e)}`);
    }
}

async function stopPid(input: {
    pid: number;
    force: boolean;
    waitMs: number;
}): Promise<Success<void> | Failure<string>> {
    const { pid, force, waitMs } = input;
    const signaled = await signalDaemonProcess({ pid, force });
    if (!signaled.success) {
        return signaled;
    }
    if (await waitForPidExit({ pid, waitMs })) {
        return success(undefined);
    }
    return failure(`Process pid ${pid} did not exit within ${Math.round(waitMs / 1000)}s.`);
}

export type StopPidResult =
    | { status: 'stopped'; pid: number }
    | { status: 'missing' }
    | { status: 'stale' }
    | { status: 'failed'; message: string; pid?: number };

export type StopOneDaemonResult =
    | StopPidResult
    | { status: 'busy' }
    | { status: 'metaCorrupt'; reason: DaemonMetaReadErrorReason };

export type DrainOrStopOneDaemonResult = StopPidResult | { status: 'draining'; pid: number };

export type StopSupervisorResult = StopPidResult;

async function markDesiredStopping(input: {
    desiredFilePath: string;
    logger?: Logger;
}): Promise<void> {
    const marked = await markStartDaemonDesiredStopping({ desiredFilePath: input.desiredFilePath });
    if (!marked.success) {
        input.logger?.warn(`Could not mark desired stopping: ${marked.data}`);
    }
}

async function readPidForStop(
    pidFilePath: string,
): Promise<StopPidResult | { status: 'alive'; pid: number }> {
    const pidAliveResult = await readDaemonPidIfAlive(pidFilePath);
    if (!pidAliveResult.success) {
        return { status: 'failed', message: pidAliveResult.data };
    }
    const pidAlive = pidAliveResult.data;
    if (pidAlive.status === 'missing') {
        return { status: 'missing' };
    }
    if (pidAlive.status === 'stale') {
        return { status: 'stale' };
    }
    return { status: 'alive', pid: pidAlive.pid };
}

async function signalWaitUnlink(input: {
    pid: number;
    unlinkPaths: Array<string | undefined>;
    force: boolean;
    waitMs: number;
}): Promise<StopPidResult> {
    const stopped = await stopPid({
        pid: input.pid,
        force: input.force,
        waitMs: input.waitMs,
    });
    if (!stopped.success) {
        return { status: 'failed', message: stopped.data, pid: input.pid };
    }
    await unlinkBestEffort(input.unlinkPaths);
    return { status: 'stopped', pid: input.pid };
}

async function pidForStopOrCleanup(input: {
    pidFilePath: string;
    unlinkPaths: Array<string | undefined>;
}): Promise<StopPidResult | { status: 'alive'; pid: number }> {
    const pidState = await readPidForStop(input.pidFilePath);
    if (pidState.status === 'stale') {
        await unlinkBestEffort(input.unlinkPaths);
        return { status: 'stale' };
    }
    return pidState;
}

type StopDaemonFilesInput = {
    pidFilePath: string;
    metaFilePath: string;
    desiredFilePath: string;
    force: boolean;
    waitMs: number;
    logger?: Logger;
};

/**
 * Operator stop: refuse when mid-run or meta is corrupt. `--force` skips both checks.
 */
export async function stopOneDaemon(input: StopDaemonFilesInput): Promise<StopOneDaemonResult> {
    const { pidFilePath, metaFilePath, desiredFilePath, force, waitMs, logger } = input;
    const unlinkPaths = [pidFilePath, metaFilePath, desiredFilePath];
    const pidState = await pidForStopOrCleanup({ pidFilePath, unlinkPaths });
    if (pidState.status !== 'alive') {
        return pidState;
    }

    const pid = pidState.pid;
    if (!force) {
        const metaResult = await readDaemonMeta(metaFilePath);
        if (!metaResult.success) {
            return { status: 'metaCorrupt', reason: metaResult.data.reason };
        }
        if (isDaemonMidRun(metaResult.data)) {
            return { status: 'busy' };
        }
    }

    await markDesiredStopping({ desiredFilePath, logger });
    return signalWaitUnlink({ pid, unlinkPaths, force, waitMs });
}

/**
 * `stop --all`: mid-run marks desired stopping and returns `draining`.
 * Corrupt meta proceeds to signal. `--force` skips the mid-run check.
 */
export async function drainOrStopOneDaemon(input: StopDaemonFilesInput): Promise<DrainOrStopOneDaemonResult> {
    const { pidFilePath, metaFilePath, desiredFilePath, force, waitMs, logger } = input;
    const unlinkPaths = [pidFilePath, metaFilePath, desiredFilePath];
    const pidState = await pidForStopOrCleanup({ pidFilePath, unlinkPaths });
    if (pidState.status !== 'alive') {
        return pidState;
    }

    const pid = pidState.pid;
    if (!force) {
        const metaResult = await readDaemonMeta(metaFilePath);
        if (metaResult.success && isDaemonMidRun(metaResult.data)) {
            await markDesiredStopping({ desiredFilePath, logger });
            return { status: 'draining', pid };
        }
    }

    await markDesiredStopping({ desiredFilePath, logger });
    return signalWaitUnlink({ pid, unlinkPaths, force, waitMs });
}

/** Pid + supervisor meta only. Never reads daemon meta or desired.json. */
export async function stopSupervisor(input: {
    pidFilePath: string;
    metaFilePath: string;
    force: boolean;
    waitMs: number;
}): Promise<StopSupervisorResult> {
    const { pidFilePath, metaFilePath, force, waitMs } = input;
    const unlinkPaths = [pidFilePath, metaFilePath];
    const pidState = await pidForStopOrCleanup({ pidFilePath, unlinkPaths });
    if (pidState.status !== 'alive') {
        return pidState;
    }
    return signalWaitUnlink({ pid: pidState.pid, unlinkPaths, force, waitMs });
}

export type StopOneDaemonCliContext = {
    projectName: string;
    daemonId: string;
    scopeLabel: string;
    pidFilePath: string;
    metaFilePath: string;
    force: boolean;
    waitMs: number;
};

export type StopOneDaemonCliFailure = {
    messages: string[];
    data?: {
        code: 'daemonBusy' | 'daemonMetaCorrupt';
        reason?: DaemonMetaReadErrorReason;
    };
};

export function stoppedDaemonCliMessage(input: {
    force: boolean;
    daemonId: string;
    projectName: string;
    scopeLabel: string;
    pid: number;
}): string {
    return input.force
        ? `Force-stopped Lumpcode daemon "${input.daemonId}" for "${input.projectName}"${input.scopeLabel} (was pid ${input.pid}).`
        : `Stopped Lumpcode daemon "${input.daemonId}" for "${input.projectName}"${input.scopeLabel} (was pid ${input.pid}).`;
}

export function stopOneDaemonCliFailure(
    stopped: Exclude<StopOneDaemonResult, { status: 'stopped' }>,
    ctx: StopOneDaemonCliContext,
): Failure<StopOneDaemonCliFailure> {
    const { projectName, scopeLabel, pidFilePath, metaFilePath, force, waitMs } = ctx;
    const waitSeconds = Math.round(waitMs / 1000);
    switch (stopped.status) {
        case 'missing':
            return failure({
                messages: [
                    `No daemon PID file for project "${projectName}"${scopeLabel} at ${pidFilePath}. The daemon may not be running.`,
                ],
            });
        case 'stale':
            return failure({
                messages: [`Invalid PID in ${pidFilePath}; removed stale file.`],
            });
        case 'metaCorrupt':
            return failure({
                messages: [
                    `Daemon meta is invalid (reason: ${stopped.reason}) at ${metaFilePath}; ` +
                        'refusing graceful stop. Run `lumpcode stop --force`.',
                ],
                data: {
                    code: 'daemonMetaCorrupt',
                    reason: stopped.reason,
                },
            });
        case 'busy':
            return failure({
                messages: [
                    'Daemon is busy running a lump (mid-run / in-flight); wait for it to finish or run `lumpcode stop --force`.',
                ],
                data: { code: 'daemonBusy' },
            });
        case 'failed': {
            const prefix = force
                ? `Force-killed pid ${stopped.pid}`
                : `Sent SIGTERM to pid ${stopped.pid}`;
            const timeout = stopped.message.includes('did not exit');
            return failure({
                messages: [
                    timeout
                        ? `${prefix} but it did not exit within ${waitSeconds}s. PID file left at ${pidFilePath}.`
                        : stopped.message,
                ],
            });
        }
        default: {
            const _exhaustive: never = stopped;
            return _exhaustive;
        }
    }
}
