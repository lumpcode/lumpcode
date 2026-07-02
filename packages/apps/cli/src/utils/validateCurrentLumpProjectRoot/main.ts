import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { type Failure, failure, type Success, success } from '@lumpcode/core';

import { localConfigFolderPath } from '../localConfigFolderPath';
import { nodeErrorCode } from '../nodeErrorCode';

const REQUIRED_DIRS = ['.git'] as const;

export async function validateCurrentLumpProjectRoot(input: {
    cwd: string;
}): Promise<Success<void> | Failure<string>> {
    const lumpcodePath = localConfigFolderPath({ projectRoot: input.cwd });
    let stat;
    try {
        stat = await fs.stat(lumpcodePath);
    } catch (error: unknown) {
        const code = nodeErrorCode(error);
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

    for (const name of REQUIRED_DIRS) {
        const fullPath = path.join(input.cwd, name);
        let stat;
        try {
            stat = await fs.stat(fullPath);
        } catch (error: unknown) {
            const code = nodeErrorCode(error);
            if (code === 'ENOENT') {
                return failure(
                    `Not a Lumpcode project root: missing ${name} directory at ${fullPath}`,
                );
            }
            return failure(`Cannot read ${name} at ${fullPath}: ${String(error)}`);
        }
        if (!stat.isDirectory()) {
            return failure(`${name} exists but is not a directory: ${fullPath}`);
        }
    }
    return success(undefined);
}
