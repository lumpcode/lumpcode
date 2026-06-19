import * as fs from 'node:fs/promises';

import type { Failure, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

export type DaemonPidAlive = { pid: number };
export type DaemonPidStale = { stale: true };
export type DaemonPidReadResult = DaemonPidAlive | DaemonPidStale | undefined;

const stalePid: DaemonPidStale = { stale: true };

/**
 * Reads a daemon PID file and checks whether the process is still running.
 * Returns `success(undefined)` when the file is missing or unreadable (ENOENT).
 */
export async function readDaemonPidIfAlive(
    pidFilePath: string,
): Promise<Success<DaemonPidReadResult> | Failure<string>> {
    let raw: string;
    try {
        raw = await fs.readFile(pidFilePath, 'utf8');
    } catch (error: unknown) {
        const code =
            error && typeof error === 'object' && 'code' in error
                ? (error as NodeJS.ErrnoException).code
                : undefined;
        if (code === 'ENOENT') {
            return success(undefined);
        }
        return failure(`Cannot read PID file "${pidFilePath}": ${String(error)}`);
    }

    const pid = Number.parseInt(raw.trim(), 10);
    if (Number.isNaN(pid)) {
        return success(stalePid);
    }

    try {
        process.kill(pid, 0);
        return success({ pid });
    } catch (e) {
        const code =
            e && typeof e === 'object' && 'code' in e ? (e as NodeJS.ErrnoException).code : undefined;
        if (code === 'ESRCH') {
            return success(stalePid);
        }
        return failure(`Could not inspect process ${pid}: ${String(e)}`);
    }
}
