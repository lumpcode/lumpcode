import * as fs from 'node:fs/promises';

import { failure, nodeErrnoCode, success, type Failure, type Success } from '@lumpcode/core';

import type { WorkspaceStrategy } from '../../types/WorkspaceStrategy';
import { daemonPidPath, legacyBareGlobalDaemonPidPath } from '../daemonPidPath';
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

/** Alive project daemons keyed by daemonId. */
export type RunningProjectDaemons = Record<string, RunningDaemonInfo>;

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function daemonIdPidFilePattern(projectName: string): RegExp {
    return new RegExp(`^${escapeRegExp(projectName)}\\.([^.]+)\\.daemon\\.pid$`);
}

async function pathExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
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
 * Keys are daemonIds. Legacy bare `<project>.daemon.pid` maps to `global`
 * when `<project>.global.daemon.pid` is absent.
 */
export async function listRunningProjectDaemons(input: {
    daemonsDir: string;
    projectName: string;
}): Promise<Success<RunningProjectDaemons> | Failure<string>> {
    const { daemonsDir, projectName } = input;
    const result: RunningProjectDaemons = {};
    const idPattern = daemonIdPidFilePattern(projectName);

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
        const match = idPattern.exec(name);
        if (!match) continue;
        const daemonId = match[1]!;
        const infoResult = await readRunningDaemonInfo(
            daemonPidPath({ daemonsDir, projectName, daemonId }),
        );
        if (!infoResult.success) return infoResult;
        if (infoResult.data !== undefined) {
            result[daemonId] = infoResult.data;
        }
    }

    if (result.global === undefined) {
        const legacyPid = legacyBareGlobalDaemonPidPath({ daemonsDir, projectName });
        if (await pathExists(legacyPid)) {
            const legacyInfo = await readRunningDaemonInfo(legacyPid);
            if (!legacyInfo.success) return legacyInfo;
            if (legacyInfo.data !== undefined) {
                result.global = legacyInfo.data;
            }
        }
    }

    return success(result);
}
