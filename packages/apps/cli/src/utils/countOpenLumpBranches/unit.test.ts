import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { countOpenLumpBranches } from './main';
import { createLumpWorkBranch } from '../../testing';
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

    it('returns 0 when no lump branches exist', async () => { // TODO : need a test with worktree strategy
        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my-lump' });
        expect(count).toBe(0);
    });

    it('counts remote branches matching the lump prefix', async () => {
        createLumpWorkBranch({ projectRoot, lumpName: 'my-lump', contextName: 'ctx-a' });
        createLumpWorkBranch({ projectRoot, lumpName: 'my-lump', contextName: 'ctx-b' });

        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my-lump' });
        expect(count).toBe(2);
    });

    it('ignores local-only branches matching the lump prefix', async () => {
        createLumpWorkBranch({ projectRoot, lumpName: 'my-lump', contextName: 'local-ctx', push: false });

        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my-lump' });
        expect(count).toBe(0);
    });

    it('returns 0 when the remote query fails', async () => {
        execGit('remote remove origin', projectRoot);

        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my-lump' });
        expect(count).toBe(0);
    });

    it('does not count branches belonging to other lumps', async () => {
        createLumpWorkBranch({ projectRoot, lumpName: 'my-lump', contextName: 'ctx-a' });
        createLumpWorkBranch({ projectRoot, lumpName: 'other-lump', contextName: 'ctx-b' });
        createLumpWorkBranch({ projectRoot, lumpName: 'other-lump', contextName: 'ctx-c' });

        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my-lump' });
        expect(count).toBe(1);
    });

    it('does not treat a lump name as a prefix of another (e.g. "my" vs "my-lump")', async () => {
        createLumpWorkBranch({ projectRoot, lumpName: 'my-lump', contextName: 'ctx-a' });

        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my' });
        expect(count).toBe(0);
    });
});
