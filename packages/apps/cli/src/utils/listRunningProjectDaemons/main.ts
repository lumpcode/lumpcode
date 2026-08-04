import * as fs from 'node:fs/promises';

import { failure, nodeErrnoCode, success, type Failure, type Success } from '@lumpcode/core';

import type { WorkspaceStrategy } from '../../types/WorkspaceStrategy';
import { daemonFileBaseName } from '../daemonFileBaseName';
import { daemonPidPath } from '../daemonPidPath';
import { metaFilePathFromPidFilePath, readDaemonMeta } from '../readDaemonMeta';
import { readDaemonPidIfAlive } from '../readDaemonPidIfAlive';

export type RunningDaemonInfo =
    | {
          pid: number;
          meta: 'ok';
          workspaceStrategy: WorkspaceStrategy;
      }
    | {
          pid: number;
          meta: 'missing' | 'invalid';
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

    const pid = aliveResult.data.pid;
    const metaResult = await readDaemonMeta(metaFilePathFromPidFilePath(pidFilePath));
    if (!metaResult.success) {
        const reason = metaResult.data.reason;
        if (reason === 'missing' || reason === 'invalid') {
            return success<RunningDaemonInfo>({ pid, meta: reason });
        }
        return failure(metaResult.data.message);
    }

    return success<RunningDaemonInfo>({
        pid,
        meta: 'ok',
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
        const code = nodeErrnoCode(error);
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
