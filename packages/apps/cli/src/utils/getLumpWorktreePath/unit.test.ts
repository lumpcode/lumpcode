import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { lumpWorktreePath } from './main';

describe('lumpWorktreePath', () => {
    it('mirrors branch segments under .lumpcode/worktrees', () => {
        const executionWorkspacePath = '/repo';
        const branchName = 'lump/migrate-vue/Button.tsx';
        expect(lumpWorktreePath({ executionWorkspacePath, branchName })).toBe(
            path.join(executionWorkspacePath, '.lumpcode', 'worktrees', 'lump', 'migrate-vue', 'Button.tsx'),
        );
    });

    it('throws when branchName does not start with lump/', () => {
        expect(() =>
            lumpWorktreePath({ executionWorkspacePath: '/repo', branchName: 'feature/foo' }),
        ).toThrow(/branchName must start with/);
    });
});
