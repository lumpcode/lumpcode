import type { Failure, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import { daemonLogPath } from '../daemonLogPath';
import { daemonMetaPath } from '../daemonMetaPath';
import { daemonPidPath } from '../daemonPidPath';
import { daemonsDirPath } from '../daemonsDirPath';
import { getProjectName } from '../getProjectName';

export type ResolvedDaemonPaths = {
    daemonsDir: string;
    pidFilePath: string;
    logFilePath: string;
    /** Written when a detached daemon starts; holds scheduling fields (e.g. cron). */
    metaFilePath: string;
    projectName: string;
    /** Set when paths are scoped to a single lump daemon. */
    lumpName?: string;
};

export async function resolveDaemonPaths(input: {
    projectRoot: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    lumpName?: string;
}): Promise<Success<ResolvedDaemonPaths> | Failure<string>> {
    const { projectRoot, localConfigFolderPath, globalConfigFolderPath, lumpName } = input;
    const nameResult = await getProjectName({ localConfigFolderPath, projectRoot });
    if (!nameResult.success) {
        return failure(nameResult.data);
    }

    const projectName = nameResult.data;
    const daemonsDir = daemonsDirPath({ globalConfigFolderPath });
    const pathInput = { daemonsDir, projectName, lumpName };

    return success({
        daemonsDir,
        pidFilePath: daemonPidPath(pathInput),
        logFilePath: daemonLogPath(pathInput),
        metaFilePath: daemonMetaPath(pathInput),
        projectName,
        ...(lumpName !== undefined ? { lumpName } : {}),
    });
}
