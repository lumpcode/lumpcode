import * as path from 'node:path';

import { execAsync, failure, type Failure, success, type Success } from '@lumpcode/core';

/**
 * Resolves the absolute git common directory for a worktree or main checkout
 * (`git rev-parse --git-common-dir`).
 */
export async function resolveGitCommonDir(input: {
    cwd: string;
}): Promise<Success<string> | Failure<string>> {
    const { cwd } = input;
    const result = await execAsync('git rev-parse --path-format=absolute --git-common-dir', { cwd });
    if (!result.success) {
        // Older git without --path-format=absolute
        const fallback = await execAsync('git rev-parse --git-common-dir', { cwd });
        if (!fallback.success) {
            return failure(`Failed to resolve git common dir: ${fallback.data.message}`);
        }
        const raw = fallback.data.stdout.trim();
        return success(path.resolve(cwd, raw));
    }
    return success(path.resolve(result.data.stdout.trim()));
}
