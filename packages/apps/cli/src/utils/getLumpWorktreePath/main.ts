import * as path from 'node:path';

import { LUMP_BRANCH_PREFIX } from '../../consts';

/**
 * Absolute path for a lump branch worktree under `.lumpcode/worktrees/`,
 * mirroring branch segments (e.g. `lump/foo/ctx` → `.../worktrees/lump/foo/ctx`).
 */
export function lumpWorktreePath({
    executionWorkspacePath,
    branchName,
}: {
    executionWorkspacePath: string;
    branchName: string;
}): string {
    if (!branchName.startsWith(LUMP_BRANCH_PREFIX)) {
        throw new Error(`branchName must start with "${LUMP_BRANCH_PREFIX}", got: ${branchName}`);
    }
    const segments = branchName.split('/');
    return path.join(executionWorkspacePath, '.lumpcode', 'worktrees', ...segments);
}
