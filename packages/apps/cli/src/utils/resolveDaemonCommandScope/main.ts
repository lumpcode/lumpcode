import type { Failure, Logger, Success } from '@lumpcode/core';
import { success } from '@lumpcode/core';

import { RESERVED_DAEMON_ID } from '../daemonFileBaseName';
import { commandFailure } from '../commandFailure';
import { resolveDaemonPaths, type ResolvedDaemonPaths } from '../resolveDaemonPaths';
import { validateCurrentLumpProjectRoot } from '../validateCurrentLumpProjectRoot';

const LUMP_NAME_DEPRECATION =
    '--lumpName is deprecated for daemon commands; use --daemonId instead.';

export async function resolveDaemonCommandScope(input: {
    projectRoot: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    daemonId?: string;
    /** @deprecated Maps to daemonId when --daemonId is omitted. */
    lumpName?: string;
    logger?: Logger;
}): Promise<
    Success<{ daemonId: string; scopeLabel: string; paths: ResolvedDaemonPaths }> | Failure<{ messages: string[] }>
> {
    const daemonIdOpt = input.daemonId?.trim() || undefined;
    const lumpNameOpt = input.lumpName?.trim() || undefined;

    if (daemonIdOpt && lumpNameOpt) {
        return commandFailure('Pass only one of --daemonId and --lumpName.');
    }

    let daemonId: string;
    if (daemonIdOpt) {
        daemonId = daemonIdOpt;
    } else if (lumpNameOpt) {
        input.logger?.warn(LUMP_NAME_DEPRECATION);
        daemonId = lumpNameOpt;
    } else {
        daemonId = RESERVED_DAEMON_ID;
    }

    const validationResult = await validateCurrentLumpProjectRoot({ cwd: input.projectRoot });
    if (!validationResult.success) return commandFailure(validationResult.data);
    const pathsResult = await resolveDaemonPaths({
        projectRoot: input.projectRoot,
        localConfigFolderPath: input.localConfigFolderPath,
        globalConfigFolderPath: input.globalConfigFolderPath,
        daemonId,
        allowLegacyGlobalAlias: true,
    });
    if (!pathsResult.success) return commandFailure(pathsResult.data);
    return success({
        daemonId,
        scopeLabel: daemonId === RESERVED_DAEMON_ID ? '' : ` daemon "${daemonId}"`,
        paths: pathsResult.data,
    });
}
