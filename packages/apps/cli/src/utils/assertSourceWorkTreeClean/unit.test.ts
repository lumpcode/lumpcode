import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assertSourceWorkTreeClean } from './main';
import { execGit } from '../execGit';
import { createTempTestDirs, removeTempTestDirs } from '../createTempTestDirs';
import { initLocalGitRepo } from '../initLocalGitRepo';

const DIRTY_MESSAGE =
    'Working tree is dirty. Commit or stash before lumpcode run in shared mode.';
const DETACHED_MESSAGE =
    'Not on a branch. Shared run needs a named branch to commit and push.';

describe.skip('assertSourceWorkTreeClean (shared-in-place-run)', () => {
    let cwd: string;

    beforeEach(async () => {
        const dirs = await createTempTestDirs({ prefix: 'lump-assert-clean-', remote: false });
        cwd = dirs.projectRoot;
        initLocalGitRepo({ cwd });
    });

    afterEach(async () => {
        await removeTempTestDirs({ projectRoot: cwd });
    });

    it('succeeds on a clean named branch and returns that branch', async () => {
        const result = await assertSourceWorkTreeClean({ cwd });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.branchName).toBe('main');
    });

    it('succeeds when the only extra files are gitignored', async () => {
        await fs.writeFile(path.join(cwd, '.gitignore'), 'ignored.txt\n', 'utf-8');
        execGit('add .gitignore', cwd);
        execGit('commit -m "ignore"', cwd);
        await fs.writeFile(path.join(cwd, 'ignored.txt'), 'skip me\n', 'utf-8');

        const result = await assertSourceWorkTreeClean({ cwd });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.branchName).toBe('main');
    });

    it('succeeds on a clean named branch that is not the execution base', async () => {
        execGit('checkout -b make-my-new-lump', cwd);
        const result = await assertSourceWorkTreeClean({ cwd });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.branchName).toBe('make-my-new-lump');
    });

    it('fails dirtyWorkTree for an untracked file', async () => {
        await fs.writeFile(path.join(cwd, 'UNTRACKED.txt'), 'x\n', 'utf-8');
        const result = await assertSourceWorkTreeClean({ cwd });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.code).toBe('dirtyWorkTree');
        expect(result.data.message).toBe(DIRTY_MESSAGE);
    });

    it('fails dirtyWorkTree for an unstaged edit', async () => {
        const filePath = path.join(cwd, 'tracked.txt');
        await fs.writeFile(filePath, 'one\n', 'utf-8');
        execGit('add tracked.txt', cwd);
        execGit('commit -m "track"', cwd);
        await fs.writeFile(filePath, 'two\n', 'utf-8');

        const result = await assertSourceWorkTreeClean({ cwd });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.code).toBe('dirtyWorkTree');
        expect(result.data.message).toBe(DIRTY_MESSAGE);
    });

    it('fails dirtyWorkTree for a staged-only change', async () => {
        await fs.writeFile(path.join(cwd, 'staged.txt'), 'x\n', 'utf-8');
        execGit('add staged.txt', cwd);

        const result = await assertSourceWorkTreeClean({ cwd });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.code).toBe('dirtyWorkTree');
        expect(result.data.message).toBe(DIRTY_MESSAGE);
    });

    it('fails detachedHead when HEAD is detached', async () => {
        execGit('checkout --detach HEAD', cwd);
        const result = await assertSourceWorkTreeClean({ cwd });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.code).toBe('detachedHead');
        expect(result.data.message).toBe(DETACHED_MESSAGE);
    });
});
