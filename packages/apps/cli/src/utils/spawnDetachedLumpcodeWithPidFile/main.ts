import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { spawn as nodeSpawn } from 'node:child_process';
import { isSea } from 'node:sea';

import { killProcessTree, type Logger, failure, success, type Failure, type Success } from '@lumpcode/core';

import { claimPidAndWriteMeta } from '../claimPidAndWriteMeta';
import type { DaemonMetaWrite } from '../readDaemonMeta';
import type { SupervisorMetaWrite } from '../supervisorPaths';

export type SpawnDetachedLumpcodeWithPidFileInput = {
    extraArgs: string[];
    cwd: string;
    logFilePath: string;
    pidFilePath: string;
    spawnFn?: typeof nodeSpawn;
    stubMeta?: {
        filePath: string;
        data: DaemonMetaWrite | SupervisorMetaWrite;
    };
    logger?: Logger;
};

function cliSpawnArgv(extraArgs: string[]): Success<string[]> | Failure<string> {
    const runningAsSeaBinary = (() => {
        try {
            return isSea();
        } catch {
            return false;
        }
    })();
    if (runningAsSeaBinary) {
        return success(extraArgs);
    }
    const cliEntry = process.argv[1];
    if (!cliEntry) {
        return failure('Could not resolve CLI entry path (process.argv[1] is empty).');
    }
    return success([cliEntry, ...extraArgs]);
}

async function spawnDetachedLumpcodeProcess(input: {
    extraArgs: string[];
    cwd: string;
    logFilePath: string;
    spawnFn?: typeof nodeSpawn;
}): Promise<Success<{ pid: number }> | Failure<string>> {
    const { extraArgs, cwd, logFilePath, spawnFn } = input;
    const spawnImpl = spawnFn ?? nodeSpawn;
    const argvResult = cliSpawnArgv(extraArgs);
    if (!argvResult.success) {
        return argvResult;
    }

    let logHandle: Awaited<ReturnType<typeof fs.open>>;
    try {
        await fs.mkdir(path.dirname(logFilePath), { recursive: true });
        logHandle = await fs.open(logFilePath, 'a');
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return failure(`Could not open log file "${logFilePath}": ${msg}`);
    }

    try {
        const child = spawnImpl(process.execPath, argvResult.data, {
            detached: true,
            stdio: ['ignore', logHandle.fd, logHandle.fd],
            cwd,
            windowsHide: true,
        });
        child.unref();
        const pid = child.pid;
        if (pid === undefined) {
            return failure('Detached process spawned without a pid.');
        }
        return success({ pid });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return failure(`Failed to spawn detached Lumpcode process: ${msg}`);
    } finally {
        await logHandle.close();
    }
}

/**
 * Spawns a detached Lumpcode process, claims its PID file with `wx`, and
 * optionally writes stub meta. Kills the child if the PID claim fails.
 * Stub-meta write failures are logged and do not fail the spawn.
 */
export async function spawnDetachedLumpcodeWithPidFile(
    input: SpawnDetachedLumpcodeWithPidFileInput,
): Promise<Success<{ pid: number }> | Failure<string>> {
    const spawnResult = await spawnDetachedLumpcodeProcess({
        extraArgs: input.extraArgs,
        cwd: input.cwd,
        logFilePath: input.logFilePath,
        spawnFn: input.spawnFn,
    });
    if (!spawnResult.success) {
        return spawnResult;
    }
    const { pid } = spawnResult.data;
    const claim = await claimPidAndWriteMeta({
        pid,
        pidFilePath: input.pidFilePath,
        ...(input.stubMeta !== undefined
            ? { meta: { filePath: input.stubMeta.filePath, data: input.stubMeta.data } }
            : {}),
        onMetaFailure: 'warn',
        logger: input.logger,
    });
    if (!claim.success) {
        await killProcessTree({ pid, graceMs: 0 });
        return claim;
    }
    return success({ pid });
}
