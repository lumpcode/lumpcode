import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTempTestDirs, removeTempTestDirs } from '../createTempTestDirs';
import { execGit } from '../execGit';
import { initLocalGitRepo } from '../initLocalGitRepo';
import {
    SHARED_RUN_DETACHED_HEAD_MESSAGE,
    assertSharedRunHead,
} from './main';

describe.skip('assertSharedRunHead (in-place-workspace)', () => {
    let cwd: string;

    beforeEach(async () => {
        ({ projectRoot: cwd } = await createTempTestDirs({
            prefix: 'lump-assert-shared-head-',
            remote: false,
            global: false,
            mkdirLocalConfig: false,
        }));
        initLocalGitRepo({ cwd });
    });

    afterEach(async () => {
        await removeTempTestDirs({ projectRoot: cwd });
    });

    it('fails detached HEAD with code detachedHead and the exact message', async () => {
        execGit('checkout --detach', cwd);

        const result = await assertSharedRunHead({ cwd });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.code).toBe('detachedHead');
        expect(result.data.message).toBe(SHARED_RUN_DETACHED_HEAD_MESSAGE);
    });

    it('succeeds on a clean named branch', async () => {
        const result = await assertSharedRunHead({ cwd });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.branchName).toBe('main');
    });

    it('succeeds on a dirty named branch (unstaged tracked edit)', async () => {
        const filePath = path.join(cwd, 'README.md');
        await fs.writeFile(filePath, '# dirty\n', 'utf-8');
        execGit('add README.md', cwd);
        execGit('commit -m "add readme"', cwd);
        await fs.writeFile(filePath, '# edited\n', 'utf-8');

        const result = await assertSharedRunHead({ cwd });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.branchName).toBe('main');
        expect(await fs.readFile(filePath, 'utf-8')).toBe('# edited\n');
    });

    it('succeeds on a named branch with a staged change', async () => {
        const filePath = path.join(cwd, 'STAGED.txt');
        await fs.writeFile(filePath, 'staged\n', 'utf-8');
        execGit('add STAGED.txt', cwd);

        const result = await assertSharedRunHead({ cwd });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.branchName).toBe('main');
    });

    it('succeeds on a named branch with ignored-only extra files', async () => {
        await fs.writeFile(path.join(cwd, '.gitignore'), 'ignored.txt\n', 'utf-8');
        execGit('add .gitignore', cwd);
        execGit('commit -m "ignore"', cwd);
        await fs.writeFile(path.join(cwd, 'ignored.txt'), 'only ignored\n', 'utf-8');

        const result = await assertSharedRunHead({ cwd });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.branchName).toBe('main');
    });
});
