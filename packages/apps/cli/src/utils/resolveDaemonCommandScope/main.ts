import type { Failure, Success } from '@lumpcode/core';
import { success } from '@lumpcode/core';

import { commandFailure } from '../commandFailure';
import { resolveDaemonPaths, type ResolvedDaemonPaths } from '../resolveDaemonPaths';
import { validateCurrentLumpProjectRoot } from '../validateCurrentLumpProjectRoot';

export async function resolveDaemonCommandScope(input: {
    projectRoot: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    lumpName?: string;
}): Promise<
    Success<{ lumpName?: string; scopeLabel: string; paths: ResolvedDaemonPaths }> | Failure<{ messages: string[] }>
> {
    const lumpName = input.lumpName?.trim() || undefined;
    const validationResult = await validateCurrentLumpProjectRoot({ cwd: input.projectRoot });
    if (!validationResult.success) return commandFailure(validationResult.data);
    const pathsResult = await resolveDaemonPaths({ ...input, lumpName });
    if (!pathsResult.success) return commandFailure(pathsResult.data);
    return success({
        lumpName,
        scopeLabel: lumpName ? ` lump "${lumpName}"` : '',
        paths: pathsResult.data,
    });
}
