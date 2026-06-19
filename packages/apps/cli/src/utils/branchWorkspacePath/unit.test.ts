import * as path from 'node:path';
import { describe, it, expect } from 'vitest';

import { branchWorkspacePath } from './main';
import { LUMP_BRANCH_PREFIX } from '../../consts';

describe('branchWorkspacePath', () => {
    it('resolves checkout to execution workspace', () => {
        const executionWorkspacePath = '/repo/copy';
        expect(
            branchWorkspacePath({
                executionWorkspacePath,
                workspaceStrategy: 'checkout',
                branchName: `${LUMP_BRANCH_PREFIX}my-lump/ctx`,
            }),
        ).toBe(path.resolve(executionWorkspacePath));
    });

    it('resolves worktree under .lumpcode/worktrees', () => {
        const executionWorkspacePath = '/repo/copy';
        const branchName = `${LUMP_BRANCH_PREFIX}my-lump/ctx`;
        expect(
            branchWorkspacePath({
                executionWorkspacePath,
                workspaceStrategy: 'worktree',
                branchName,
            }),
        ).toBe(path.join(executionWorkspacePath, '.lumpcode', 'worktrees', ...branchName.split('/')));
    });
});
