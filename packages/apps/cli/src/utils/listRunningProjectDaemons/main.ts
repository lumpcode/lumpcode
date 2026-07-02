import * as fs from 'node:fs/promises';

import type { Failure, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import type { WorkspaceStrategy } from '../../types/WorkspaceStrategy';
import { daemonFileBaseName } from '../daemonFileBaseName';
import { daemonPidPath } from '../daemonPidPath';
import { metaFilePathFromPidFilePath, readDaemonMeta } from '../readDaemonMeta';
import { nodeErrorCode } from '../nodeErrorCode';
import { readDaemonPidIfAlive } from '../readDaemonPidIfAlive';

export type RunningDaemonInfo = {
    pid: number;
    workspaceStrategy: WorkspaceStrategy;
};

export type RunningProjectDaemons = {
    global?: RunningDaemonInfo;
    lumps: Record<string, RunningDaemonInfo>;
};

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function perLumpDaemonPidFilePattern(projectName: string): RegExp {
    const exampleBase = daemonFileBaseName({ projectName, lumpName: '__LUMP__' });
    const pattern = `^${escapeRegExp(exampleBase).replace('__LUMP__', '([^.]+)')}\\.daemon\\.pid$`;
    return new RegExp(pattern);
}

async function readRunningDaemonInfo(
    pidFilePath: string,
): Promise<Success<RunningDaemonInfo | undefined> | Failure<string>> {
    const aliveResult = await readDaemonPidIfAlive(pidFilePath);
    if (!aliveResult.success) return aliveResult;
    if (!aliveResult.data || !('pid' in aliveResult.data)) {
        return success(undefined);
    }

    const metaResult = await readDaemonMeta(metaFilePathFromPidFilePath(pidFilePath));
    if (!metaResult.success) return metaResult;

    return success({
        pid: aliveResult.data.pid,
        workspaceStrategy: metaResult.data.workspaceStrategy,
    });
}

/**
 * Lists alive background daemons for a project under `daemonsDir`.
 */
export async function listRunningProjectDaemons(input: {
    daemonsDir: string;
    projectName: string;
}): Promise<Success<RunningProjectDaemons> | Failure<string>> {
    const { daemonsDir, projectName } = input;
    const result: RunningProjectDaemons = { lumps: {} };

    const globalInfoResult = await readRunningDaemonInfo(
        daemonPidPath({ daemonsDir, projectName }),
    );
    if (!globalInfoResult.success) return globalInfoResult;
    if (globalInfoResult.data !== undefined) {
        result.global = globalInfoResult.data;
    }

    const perLumpPattern = perLumpDaemonPidFilePattern(projectName);

    let entries: string[];
    try {
        entries = await fs.readdir(daemonsDir);
    } catch (error: unknown) {
        const code = nodeErrorCode(error);
        if (code === 'ENOENT') {
            return success(result);
        }
        return failure(`Cannot read daemons directory "${daemonsDir}": ${String(error)}`);
    }

    for (const name of entries) {
        const match = perLumpPattern.exec(name);
        if (!match) continue;
        const lumpName = match[1];
        const infoResult = await readRunningDaemonInfo(
            daemonPidPath({ daemonsDir, projectName, lumpName }),
        );
        if (!infoResult.success) return infoResult;
        if (infoResult.data !== undefined) {
            result.lumps[lumpName] = infoResult.data;
        }
    }

    return success(result);
}
