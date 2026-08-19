import * as fs from 'node:fs/promises';

import type { Failure, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import { RESERVED_DAEMON_ID } from '../daemonFileBaseName';
import {
    daemonSchedulerFiles,
    legacyGlobalDaemonSchedulerFiles,
    type DaemonSchedulerFiles,
} from '../daemonSchedulerFiles';
import { daemonsDirPath } from '../daemonsDirPath';
import { getProjectName } from '../getProjectName';

export type ResolvedDaemonPaths = DaemonSchedulerFiles & {
    daemonsDir: string;
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
    const files = daemonSchedulerFiles({ daemonsDir, projectName, daemonId });

    const modern: ResolvedDaemonPaths = {
        daemonsDir,
        projectName,
        daemonId,
        ...files,
    };

    if (
        allowLegacyGlobalAlias &&
        daemonId === RESERVED_DAEMON_ID &&
        !(await pathExists(modern.pidFilePath))
    ) {
        const legacy = legacyGlobalDaemonSchedulerFiles({ daemonsDir, projectName });
        if (await pathExists(legacy.pidFilePath)) {
            return success({
                ...modern,
                pidFilePath: legacy.pidFilePath,
                logFilePath: legacy.logFilePath,
                metaFilePath: legacy.metaFilePath,
                usedLegacyGlobalAlias: true,
            });
        }
    }

    return success(modern);
}
