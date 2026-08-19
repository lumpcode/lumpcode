import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { failure, nodeErrnoCode, success, type Failure, type Success } from '@lumpcode/core';

import { daemonFileBaseName, legacyGlobalDaemonFileBaseName } from '../daemonFileBaseName';
import { unlinkBestEffort } from '../unlinkBestEffort';

const DAEMON_PID_FILE_SUFFIX = '.daemon.pid';
const DAEMON_META_FILE_SUFFIX = '.daemon.meta.json';
const DAEMON_LOG_FILE_SUFFIX = '.daemon.log';
const DAEMON_DESIRED_FILE_SUFFIX = '.daemon.desired.json';

export type DaemonSchedulerFiles = {
    pidFilePath: string;
    metaFilePath: string;
    logFilePath: string;
    desiredFilePath: string;
};

export type DaemonSchedulerFileKind = 'pid' | 'desired';

type SchedulerPathInput = {
    daemonsDir: string;
    projectName: string;
};

function joinDaemonFile(daemonsDir: string, base: string, suffix: string): string {
    return path.join(daemonsDir, `${base}${suffix}`);
}

function filesForBase(daemonsDir: string, base: string): DaemonSchedulerFiles {
    return {
        pidFilePath: joinDaemonFile(daemonsDir, base, DAEMON_PID_FILE_SUFFIX),
        metaFilePath: joinDaemonFile(daemonsDir, base, DAEMON_META_FILE_SUFFIX),
        logFilePath: joinDaemonFile(daemonsDir, base, DAEMON_LOG_FILE_SUFFIX),
        desiredFilePath: joinDaemonFile(daemonsDir, base, DAEMON_DESIRED_FILE_SUFFIX),
    };
}

export function daemonSchedulerFiles(
    input: SchedulerPathInput & { daemonId: string },
): DaemonSchedulerFiles {
    return filesForBase(input.daemonsDir, daemonFileBaseName(input));
}

/** Pre-daemon-id global paths: `<project>.daemon.{pid,meta.json,log,desired.json}`. */
export function legacyGlobalDaemonSchedulerFiles(input: SchedulerPathInput): DaemonSchedulerFiles {
    return filesForBase(input.daemonsDir, legacyGlobalDaemonFileBaseName(input.projectName));
}

/** Best-effort unlink of whichever scheduler paths are present. Does not touch omitted fields. */
export async function unlinkSchedulerFiles(files: Partial<DaemonSchedulerFiles>): Promise<void> {
    await unlinkBestEffort([
        files.pidFilePath,
        files.metaFilePath,
        files.logFilePath,
        files.desiredFilePath,
    ]);
}

function suffixForKind(kind: DaemonSchedulerFileKind): string {
    switch (kind) {
        case 'pid':
            return DAEMON_PID_FILE_SUFFIX;
        case 'desired':
            return DAEMON_DESIRED_FILE_SUFFIX;
        default: {
            const _exhaustive: never = kind;
            return _exhaustive;
        }
    }
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Lists daemon ids from `{projectName}.{id}{suffix}` filenames in `dir`.
 * Missing directory → empty list.
 */
export async function listDaemonIds(input: {
    dir: string;
    projectName: string;
    kind: DaemonSchedulerFileKind;
}): Promise<Success<string[]> | Failure<string>> {
    const { dir, projectName, kind } = input;
    const suffix = suffixForKind(kind);
    const pattern = new RegExp(
        `^${escapeRegExp(projectName)}\\.([a-zA-Z0-9_-]+)${escapeRegExp(suffix)}$`,
    );
    let entries: string[];
    try {
        entries = await fs.readdir(dir);
    } catch (error: unknown) {
        if (nodeErrnoCode(error) === 'ENOENT') {
            return success([]);
        }
        return failure(`Cannot read daemons directory "${dir}": ${String(error)}`);
    }
    const ids: string[] = [];
    for (const name of entries) {
        const match = pattern.exec(name);
        if (!match) continue;
        ids.push(match[1]!);
    }
    return success(ids);
}
