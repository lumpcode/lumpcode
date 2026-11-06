import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { countOpenLumpBranches } from './main';
import { LUMP_BRANCH_PREFIX } from '../../consts';
import { execGit } from '../execGit';
import { initBareRemoteAndCheckout } from '../initBareRemoteAndCheckout';
import { createTempTestDirs, removeTempTestDirs } from '../createTempTestDirs';

describe('countOpenLumpBranches', () => {
    let projectRoot: string;
    let remoteDir: string;

    beforeEach(async () => {
        ({ projectRoot, remoteDir } = await createTempTestDirs({ prefix: 'lump-count-branches-', global: false }));
        initBareRemoteAndCheckout({ projectRoot, remoteDir });
    });

    afterEach(async () => {
        await removeTempTestDirs({ projectRoot, remoteDir });
    });

    function createAndPushLumpBranch(lumpName: string, contextName: string) {
        const branch = `${LUMP_BRANCH_PREFIX}${lumpName}/${contextName}`;
        execGit('checkout main', projectRoot);
        execGit(`checkout -b ${branch}`, projectRoot);
        execGit(`commit --allow-empty -m "lump work"`, projectRoot);
        execGit(`push origin ${branch}`, projectRoot);
    }

    function createLocalOnlyLumpBranch(lumpName: string, contextName: string) {
        const branch = `${LUMP_BRANCH_PREFIX}${lumpName}/${contextName}`;
        execGit('checkout main', projectRoot);
        execGit(`checkout -b ${branch}`, projectRoot);
        execGit(`commit --allow-empty -m "lump work"`, projectRoot);
    }

    it('returns 0 when no lump branches exist', async () => { // TODO : need a test with worktree strategy
        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my-lump' });
        expect(count).toBe(0);
    });

    it('counts remote branches matching the lump prefix', async () => {
        createAndPushLumpBranch('my-lump', 'ctx-a');
        createAndPushLumpBranch('my-lump', 'ctx-b');
        execGit('checkout main', projectRoot);

        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my-lump' });
        expect(count).toBe(2);
    });

    it('ignores local-only branches matching the lump prefix', async () => {
        createLocalOnlyLumpBranch('my-lump', 'local-ctx');
        execGit('checkout main', projectRoot);

        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my-lump' });
        expect(count).toBe(0);
    });

    it('returns 0 when the remote query fails', async () => {
        execGit('remote remove origin', projectRoot);

        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my-lump' });
        expect(count).toBe(0);
    });

    it('does not count branches belonging to other lumps', async () => {
        createAndPushLumpBranch('my-lump', 'ctx-a');
        createAndPushLumpBranch('other-lump', 'ctx-b');
        createAndPushLumpBranch('other-lump', 'ctx-c');
        execGit('checkout main', projectRoot);

        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my-lump' });
        expect(count).toBe(1);
    });

    it('does not treat a lump name as a prefix of another (e.g. "my" vs "my-lump")', async () => {
        createAndPushLumpBranch('my-lump', 'ctx-a');
        execGit('checkout main', projectRoot);

        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my' });
        expect(count).toBe(0);
    });

    it('does not count a lump branch merged into main with a merge commit', async () => {
        createAndPushLumpBranch('my-lump', 'ctx-a');
        execGit('checkout main', projectRoot);
        execGit(`merge --no-ff ${LUMP_BRANCH_PREFIX}my-lump/ctx-a -m "merge"`, projectRoot);
        execGit('push origin main', projectRoot);
        execGit('fetch origin main', projectRoot);

        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my-lump' });
        expect(count).toBe(0);
    });

    it('does not count a lump branch fast-forwarded into main', async () => {
        createAndPushLumpBranch('my-lump', 'ctx-a');
        execGit('checkout main', projectRoot);
        execGit(`merge --ff-only ${LUMP_BRANCH_PREFIX}my-lump/ctx-a`, projectRoot);
        execGit('push origin main', projectRoot);
        execGit('fetch origin main', projectRoot);

        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my-lump' });
        expect(count).toBe(0);
    });

    it('counts the unmerged branch when another lump branch is already merged', async () => {
        createAndPushLumpBranch('my-lump', 'ctx-a');
        execGit('checkout main', projectRoot);
        execGit(`merge --no-ff ${LUMP_BRANCH_PREFIX}my-lump/ctx-a -m "merge"`, projectRoot);
        execGit('push origin main', projectRoot);
        execGit('fetch origin main', projectRoot);
        createAndPushLumpBranch('my-lump', 'ctx-b');
        execGit('checkout main', projectRoot);

        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my-lump' });
        expect(count).toBe(1);
    });

    it('still counts a squash-merged lump branch', async () => {
        const branch = `${LUMP_BRANCH_PREFIX}my-lump/ctx-a`;
        execGit('checkout main', projectRoot);
        execGit(`checkout -b ${branch}`, projectRoot);
        await fs.writeFile(path.join(projectRoot, 'note.txt'), 'squash me\n');
        execGit('add note.txt', projectRoot);
        execGit('commit -m "lump work"', projectRoot);
        execGit(`push origin ${branch}`, projectRoot);
        execGit('checkout main', projectRoot);
        execGit(`merge --squash ${branch}`, projectRoot);
        execGit('commit -m "squash"', projectRoot);
        execGit('push origin main', projectRoot);
        execGit('fetch origin main', projectRoot);

        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my-lump' });
        expect(count).toBe(1);
    });

    it('counts a lump tip pushed from another clone and not fetched', async () => {
        const cloneRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-count-branches-clone-'));
        try {
            execGit(`clone ${remoteDir} ${cloneRoot}`, os.tmpdir());
            execGit('config user.email "test@test.com"', cloneRoot);
            execGit('config user.name "Test"', cloneRoot);
            const branch = `${LUMP_BRANCH_PREFIX}my-lump/from-other`;
            execGit(`checkout -b ${branch}`, cloneRoot);
            execGit('commit --allow-empty -m "from other"', cloneRoot);
            execGit(`push origin ${branch}`, cloneRoot);

            const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my-lump' });
            expect(count).toBe(1);
        } finally {
            await fs.rm(cloneRoot, { recursive: true, force: true });
        }
    });
});
