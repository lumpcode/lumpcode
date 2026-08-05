import * as fs from 'node:fs/promises';

import type { Failure, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import { RESERVED_DAEMON_ID } from '../daemonFileBaseName';
import { daemonLogPath, legacyGlobalDaemonLogPath } from '../daemonLogPath';
import { daemonMetaPath, legacyGlobalDaemonMetaPath } from '../daemonMetaPath';
import { daemonPidPath, legacyGlobalDaemonPidPath } from '../daemonPidPath';
import { daemonsDirPath } from '../daemonsDirPath';
import { getProjectName } from '../getProjectName';

export type ResolvedDaemonPaths = {
    daemonsDir: string;
    pidFilePath: string;
    logFilePath: string;
    metaFilePath: string;
    projectName: string;
    daemonId: string;
    /** True when companions resolved the legacy bare `<project>.daemon.*` paths. */
    usedLegacyGlobalAlias?: boolean;
};

async function pathExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

export async function resolveDaemonPaths(input: {
    projectRoot: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    daemonId: string;
    /**
     * When true (companions), id `global` may fall back to legacy bare project paths
     * if the new-style `…global.daemon.pid` is missing.
     * Start/write paths should pass false (default).
     */
    allowLegacyGlobalAlias?: boolean;
}): Promise<Success<ResolvedDaemonPaths> | Failure<string>> {
    const {
        projectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
        daemonId,
        allowLegacyGlobalAlias = false,
    } = input;
    const nameResult = await getProjectName({ localConfigFolderPath, projectRoot });
    if (!nameResult.success) {
        return failure(nameResult.data);
    }

    const projectName = nameResult.data;
    const daemonsDir = daemonsDirPath({ globalConfigFolderPath });
    const pathInput = { daemonsDir, projectName, daemonId };

    const modern: ResolvedDaemonPaths = {
        daemonsDir,
        pidFilePath: daemonPidPath(pathInput),
        logFilePath: daemonLogPath(pathInput),
        metaFilePath: daemonMetaPath(pathInput),
        projectName,
        daemonId,
    };

    if (
        allowLegacyGlobalAlias &&
        daemonId === RESERVED_DAEMON_ID &&
        !(await pathExists(modern.pidFilePath))
    ) {
        const legacyPid = legacyGlobalDaemonPidPath({ daemonsDir, projectName });
        if (await pathExists(legacyPid)) {
            return success({
                daemonsDir,
                pidFilePath: legacyPid,
                logFilePath: legacyGlobalDaemonLogPath({ daemonsDir, projectName }),
                metaFilePath: legacyGlobalDaemonMetaPath({ daemonsDir, projectName }),
                projectName,
                daemonId,
                usedLegacyGlobalAlias: true,
            });
        }
    }

    return success(modern);
}
