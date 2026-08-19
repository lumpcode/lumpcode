import type { Failure, Success } from '@lumpcode/core';
import { failure, isProcessAlive, nodeErrnoCode, success } from '@lumpcode/core';
import * as fs from 'node:fs/promises';

export type DaemonPidReadResult =
    | { status: 'alive'; pid: number }
    | { status: 'stale' }
    | { status: 'missing' };

/**
 * Reads a daemon PID file and checks whether the process is still running.
 */
export async function readDaemonPidIfAlive(
    pidFilePath: string,
): Promise<Success<DaemonPidReadResult> | Failure<string>> {
    let raw: string;
    try {
        raw = await fs.readFile(pidFilePath, 'utf8');
    } catch (error: unknown) {
        const code = nodeErrnoCode(error);
        if (code === 'ENOENT') {
            return success({ status: 'missing' as const });
        }
        return failure(`Cannot read PID file "${pidFilePath}": ${String(error)}`);
    }

    const pid = Number.parseInt(raw.trim(), 10);
    if (Number.isNaN(pid)) {
        return success({ status: 'stale' as const });
    }

    try {
        if (!isProcessAlive(pid)) {
            return success({ status: 'stale' as const });
        }
        return success({ status: 'alive' as const, pid });
    } catch (e) {
        return failure(`Could not inspect process ${pid}: ${String(e)}`);
    }
}
