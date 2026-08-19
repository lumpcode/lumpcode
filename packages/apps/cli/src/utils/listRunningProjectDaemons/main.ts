import { failure, success, type Failure, type Success } from '@lumpcode/core';

import { RESERVED_DAEMON_ID } from '../daemonFileBaseName';
import {
    daemonSchedulerFiles,
    legacyGlobalDaemonSchedulerFiles,
    listDaemonIds,
    type DaemonSchedulerFiles,
} from '../daemonSchedulerFiles';
import {
    daemonMetaInclude,
    readDaemonMeta,
    type DaemonMeta,
} from '../readDaemonMeta';
import { readDaemonPidIfAlive } from '../readDaemonPidIfAlive';

export type RunningDaemonInfo = DaemonSchedulerFiles & { pid: number } & (
        | { meta: DaemonMeta }
        | { metaStatus: 'missing' | 'invalid' }
    );

export function hasRunningDaemonMeta(
    info: RunningDaemonInfo,
): info is DaemonSchedulerFiles & { pid: number; meta: DaemonMeta } {
    return !('metaStatus' in info);
}

/** Alive daemons for a project, keyed by daemonId. */
export type RunningProjectDaemons = Record<string, RunningDaemonInfo>;

async function readRunningDaemonInfo(
    files: DaemonSchedulerFiles,
): Promise<Success<RunningDaemonInfo | undefined> | Failure<string>> {
    const aliveResult = await readDaemonPidIfAlive(files.pidFilePath);
    if (!aliveResult.success) return aliveResult;
    if (aliveResult.data.status !== 'alive') {
        return success(undefined);
    }

    const pid = aliveResult.data.pid;
    const metaResult = await readDaemonMeta(files.metaFilePath);
    if (!metaResult.success) {
        const reason = metaResult.data.reason;
        if (reason === 'missing' || reason === 'invalid') {
            return success<RunningDaemonInfo>({ pid, ...files, metaStatus: reason });
        }
        return failure(metaResult.data.message);
    }

    const parsed = metaResult.data;
    const include = daemonMetaInclude(parsed);
    return success<RunningDaemonInfo>({
        pid,
        ...files,
        meta: include !== undefined ? { ...parsed, include } : parsed,
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
    const result: RunningProjectDaemons = {};

    const idsResult = await listDaemonIds({
        dir: daemonsDir,
        projectName,
        kind: 'pid',
    });
    if (!idsResult.success) {
        return idsResult;
    }

    for (const daemonId of idsResult.data) {
        const infoResult = await readRunningDaemonInfo(
            daemonSchedulerFiles({ daemonsDir, projectName, daemonId }),
        );
        if (!infoResult.success) return infoResult;
        if (infoResult.data !== undefined) {
            result[daemonId] = infoResult.data;
        }
    }

    // Legacy bare `<project>.daemon.pid` → id `global` when new-style global is absent.
    if (result[RESERVED_DAEMON_ID] === undefined) {
        const legacyInfo = await readRunningDaemonInfo(
            legacyGlobalDaemonSchedulerFiles({ daemonsDir, projectName }),
        );
        if (!legacyInfo.success) return legacyInfo;
        if (legacyInfo.data !== undefined) {
            result[RESERVED_DAEMON_ID] = legacyInfo.data;
        }
    }

    return success(result);
}
