import * as fs from 'node:fs/promises';

import { execAsync, failure, nodeErrnoCode, success, type Failure, type Success } from '@lumpcode/core';

import { localConfigFolderPath } from '../localConfigFolderPath';

export async function validateCurrentLumpProjectRoot(input: {
    cwd: string;
}): Promise<Success<void> | Failure<string>> {
    const lumpcodePath = localConfigFolderPath({ projectRoot: input.cwd });
    let stat;
    try {
        stat = await fs.stat(lumpcodePath);
    } catch (error: unknown) {
        const code = nodeErrnoCode(error);
        if (code === 'ENOENT') {
            return failure(
                `Not a Lumpcode project root: missing .lumpcode directory at ${lumpcodePath}`,
            );
        }
        return failure(`Cannot read .lumpcode at ${lumpcodePath}: ${String(error)}`);
    }
    if (!stat.isDirectory()) {
        return failure(`.lumpcode exists but is not a directory: ${lumpcodePath}`);
    }

    const gitDirResult = await execAsync('git rev-parse --git-dir', { cwd: input.cwd });
    if (!gitDirResult.success) {
        return failure(
            `Not a Lumpcode project root: git rev-parse --git-dir failed at ${input.cwd}`,
        );
    }
    return success(undefined);
}
