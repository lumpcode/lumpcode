import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { spawn as nodeSpawn } from 'node:child_process';

import { type Logger, success, type Failure, type Success } from '@lumpcode/core';

import { readDaemonPidIfAlive } from '../readDaemonPidIfAlive';
import { unlinkBestEffort } from '../unlinkBestEffort';
import { spawnDetachedLumpcodeWithPidFile } from '../spawnDetachedLumpcodeWithPidFile';
import {
    supervisorDirPath,
    supervisorLogPath,
    supervisorMetaPath,
    supervisorPidPath,
    type SupervisorMetaWrite,
} from '../supervisorPaths';

export type EnsureProjectSupervisorInput = {
    projectRoot: string;
    projectName: string;
    globalConfigFolderPath: string;
    spawnFn?: typeof nodeSpawn;
    logger?: Logger;
};

/**
 * Starts `lumpcode supervise --foreground` for this project when the supervisor PID is dead.
 * Returns the live supervisor pid (adopted or newly spawned).
 */
export async function ensureProjectSupervisor(
    input: EnsureProjectSupervisorInput,
): Promise<Success<{ pid: number }> | Failure<string>> {
    const { projectName, globalConfigFolderPath, spawnFn, logger } = input;
    const projectRoot = path.resolve(input.projectRoot);
    const pidFilePath = supervisorPidPath({ globalConfigFolderPath, projectName });
    const logFilePath = supervisorLogPath({ globalConfigFolderPath, projectName });
    const metaFilePath = supervisorMetaPath({ globalConfigFolderPath, projectName });

    await fs.mkdir(supervisorDirPath({ globalConfigFolderPath }), { recursive: true });

    const aliveResult = await readDaemonPidIfAlive(pidFilePath);
    if (!aliveResult.success) {
        return aliveResult;
    }
    const alive = aliveResult.data;
    if (alive.status === 'alive') {
        return success({ pid: alive.pid });
    }
    if (alive.status === 'stale') {
        await unlinkBestEffort([pidFilePath, metaFilePath]);
    }

    logger?.info(`starting project supervisor for "${projectName}"`);
    const spawnResult = await spawnDetachedLumpcodeWithPidFile({
        extraArgs: ['supervise', '--foreground', '--projectRoot', projectRoot],
        cwd: projectRoot,
        logFilePath,
        pidFilePath,
        spawnFn,
        stubMeta: {
            filePath: metaFilePath,
            data: {
                projectRoot,
                startedAt: new Date().toISOString(),
            } satisfies SupervisorMetaWrite,
        },
        logger,
    });
    if (!spawnResult.success) {
        return spawnResult;
    }
    return success({ pid: spawnResult.data.pid });
}
