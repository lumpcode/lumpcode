import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { failure, nodeErrnoCode, success, type Failure, type Logger, type Success } from '@lumpcode/core';

import { readDaemonPidIfAlive } from '../readDaemonPidIfAlive';
import { writeJsonFile } from '../writeJsonFile';

export type ClaimPidAndWriteMetaInput<T> = {
    pid: number;
    pidFilePath: string;
    meta?: {
        filePath: string;
        data: T;
    };
    onMetaFailure: 'fail' | 'warn';
    logger?: Logger;
};

/**
 * Unlinks `pidFilePath` and `extraFilePaths` only when the pid file contains
 * this process's pid. Missing or foreign pid files are left alone.
 */
export async function removeOwnPidArtifacts(input: {
    pidFilePath: string;
    extraFilePaths?: string[];
}): Promise<void> {
    try {
        const raw = await fs.readFile(input.pidFilePath, 'utf8');
        const filePid = Number.parseInt(raw.trim(), 10);
        if (Number.isNaN(filePid) || filePid !== process.pid) {
            return;
        }
        await fs.unlink(input.pidFilePath);
        for (const extra of input.extraFilePaths ?? []) {
            await fs.unlink(extra).catch(() => {});
        }
    } catch {
        // missing or unreadable — ignore
    }
}

async function tryExclusiveWrite(input: {
    pidFilePath: string;
    pid: number;
}): Promise<'ok' | 'retry' | Failure<string>> {
    const { pidFilePath, pid } = input;
    try {
        await fs.writeFile(pidFilePath, String(pid), { encoding: 'utf8', flag: 'wx' });
        return 'ok';
    } catch (error: unknown) {
        if (nodeErrnoCode(error) !== 'EEXIST') {
            return failure(`Cannot write PID file "${pidFilePath}": ${String(error)}`);
        }
        const aliveResult = await readDaemonPidIfAlive(pidFilePath);
        if (!aliveResult.success) {
            return aliveResult;
        }
        const alive = aliveResult.data;
        if (alive.status === 'alive') {
            if (alive.pid === pid) {
                return 'ok';
            }
            return failure(
                `PID file "${pidFilePath}" is held by live pid ${alive.pid}; cannot claim it for pid ${pid}.`,
            );
        }
        await fs.unlink(pidFilePath).catch(() => {});
        return 'retry';
    }
}

/**
 * Creates a PID file with `wx`. If the file already exists:
 * same live pid → ok; other live pid → fail; stale/missing → unlink and retry once.
 */
async function writeDaemonPidExclusive(input: {
    pidFilePath: string;
    pid: number;
}): Promise<Success<void> | Failure<string>> {
    const first = await tryExclusiveWrite(input);
    if (first === 'ok') {
        return success(undefined);
    }
    if (first !== 'retry') {
        return first;
    }
    const second = await tryExclusiveWrite(input);
    if (second === 'ok') {
        return success(undefined);
    }
    if (second === 'retry') {
        return failure(`Could not exclusively create PID file "${input.pidFilePath}" after stale retry.`);
    }
    return second;
}

/**
 * Claims `pidFilePath` with `wx` and optionally writes meta next to it.
 * `onMetaFailure: 'fail'` unlinks this process's pid artifacts.
 * `onMetaFailure: 'warn'` keeps the pid file and logs.
 */
export async function claimPidAndWriteMeta<T>(
    input: ClaimPidAndWriteMetaInput<T>,
): Promise<Success<void> | Failure<string>> {
    const { pid, pidFilePath, meta, onMetaFailure, logger } = input;
    await fs.mkdir(path.dirname(pidFilePath), { recursive: true });
    const wx = await writeDaemonPidExclusive({ pidFilePath, pid });
    if (!wx.success) {
        return wx;
    }
    if (meta === undefined) {
        return success(undefined);
    }
    const metaWrite = await writeJsonFile({
        filePath: meta.filePath,
        data: meta.data,
        trailingNewline: true,
        mkdir: true,
    });
    if (metaWrite.success) {
        return success(undefined);
    }
    if (onMetaFailure === 'warn') {
        logger?.warn(`Wrote PID but could not write stub meta: ${metaWrite.data}`);
        return success(undefined);
    }
    await removeOwnPidArtifacts({ pidFilePath, extraFilePaths: [meta.filePath] });
    return failure(metaWrite.data);
}
