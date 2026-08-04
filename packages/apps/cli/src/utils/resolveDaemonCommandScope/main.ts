import * as fs from 'node:fs/promises';

import type { Failure, Success } from '@lumpcode/core';
import { success } from '@lumpcode/core';

import { commandFailure } from '../commandFailure';
import { legacyBareGlobalDaemonLogPath } from '../daemonLogPath';
import { legacyBareGlobalDaemonMetaPath } from '../daemonMetaPath';
import { legacyBareGlobalDaemonPidPath } from '../daemonPidPath';
import { resolveDaemonPaths, type ResolvedDaemonPaths } from '../resolveDaemonPaths';
import { validateCurrentLumpProjectRoot } from '../validateCurrentLumpProjectRoot';

async function pathExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * For id `global`, prefer new `<project>.global.daemon.*` paths; if missing,
 * fall back to legacy bare `<project>.daemon.*` when those exist.
 */
async function withLegacyGlobalReadFallback(
    paths: ResolvedDaemonPaths,
): Promise<ResolvedDaemonPaths> {
    if (paths.daemonId !== 'global') {
        return paths;
    }
    if (await pathExists(paths.pidFilePath)) {
        return paths;
    }
    const legacyPid = legacyBareGlobalDaemonPidPath({
        daemonsDir: paths.daemonsDir,
        projectName: paths.projectName,
    });
    if (!(await pathExists(legacyPid))) {
        return paths;
    }
    return {
        ...paths,
        pidFilePath: legacyPid,
        logFilePath: legacyBareGlobalDaemonLogPath({
            daemonsDir: paths.daemonsDir,
            projectName: paths.projectName,
        }),
        metaFilePath: legacyBareGlobalDaemonMetaPath({
            daemonsDir: paths.daemonsDir,
            projectName: paths.projectName,
        }),
    };
}

export async function resolveDaemonCommandScope(input: {
    projectRoot: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    daemonId?: string;
    /** @deprecated Treat as daemonId. */
    lumpName?: string;
}): Promise<
    | Success<{ daemonId: string; scopeLabel: string; paths: ResolvedDaemonPaths }>
    | Failure<{ messages: string[] }>
> {
    const daemonIdOpt = input.daemonId?.trim() || undefined;
    const lumpNameOpt = input.lumpName?.trim() || undefined;

    if (daemonIdOpt !== undefined && lumpNameOpt !== undefined) {
        return commandFailure(
            'Pass only one of --daemonId or --lumpName (deprecated); they cannot be used together.',
        );
    }

    const daemonId = daemonIdOpt ?? lumpNameOpt ?? 'global';

    const validationResult = await validateCurrentLumpProjectRoot({ cwd: input.projectRoot });
    if (!validationResult.success) return commandFailure(validationResult.data);

    const pathsResult = await resolveDaemonPaths({
        projectRoot: input.projectRoot,
        localConfigFolderPath: input.localConfigFolderPath,
        globalConfigFolderPath: input.globalConfigFolderPath,
        daemonId,
    });
    if (!pathsResult.success) return commandFailure(pathsResult.data);

    const paths = await withLegacyGlobalReadFallback(pathsResult.data);
    const scopeLabel = daemonId === 'global' ? '' : ` daemon "${daemonId}"`;

    return success({
        daemonId,
        scopeLabel,
        paths,
    });
}
