import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { countOpenLumpBranches } from './main';
import { LUMP_BRANCH_PREFIX } from '../../consts';

function git(cmd: string, cwd: string) {
    execSync(`git ${cmd}`, { cwd, stdio: 'pipe' });
}

describe('countOpenLumpBranches', () => {
    let projectRoot: string;
    let remoteDir: string;

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-count-branches-'));
        remoteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-count-branches-remote-'));
        git('init --bare', remoteDir);
        git('init -b main', projectRoot);
        git('config user.email "test@test.com"', projectRoot);
        git('config user.name "Test"', projectRoot);
        git('commit --allow-empty -m "init"', projectRoot);
        git(`remote add origin ${remoteDir}`, projectRoot);
        git('push -u origin main', projectRoot);
    });

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
        await fs.rm(remoteDir, { recursive: true, force: true });
    });

    function createAndPushLumpBranch(lumpName: string, contextName: string) {
        const branch = `${LUMP_BRANCH_PREFIX}${lumpName}/${contextName}`;
        git('checkout main', projectRoot);
        git(`checkout -b ${branch}`, projectRoot);
        git(`commit --allow-empty -m "lump work"`, projectRoot);
        git(`push origin ${branch}`, projectRoot);
    }

    function createLocalOnlyLumpBranch(lumpName: string, contextName: string) {
        const branch = `${LUMP_BRANCH_PREFIX}${lumpName}/${contextName}`;
        git('checkout main', projectRoot);
        git(`checkout -b ${branch}`, projectRoot);
        git(`commit --allow-empty -m "lump work"`, projectRoot);
    }

    it('returns 0 when no lump branches exist', async () => { // TODO : need a test with worktree strategy
        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my-lump' });
        expect(count).toBe(0);
    });

    it('counts remote branches matching the lump prefix', async () => {
        createAndPushLumpBranch('my-lump', 'ctx-a');
        createAndPushLumpBranch('my-lump', 'ctx-b');
        git('checkout main', projectRoot);

        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my-lump' });
        expect(count).toBe(2);
    });

    it('ignores local-only branches matching the lump prefix', async () => {
        createLocalOnlyLumpBranch('my-lump', 'local-ctx');
        git('checkout main', projectRoot);

        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my-lump' });
        expect(count).toBe(0);
    });

    it('returns 0 when the remote query fails', async () => {
        git('remote remove origin', projectRoot);

        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my-lump' });
        expect(count).toBe(0);
    });

    it('does not count branches belonging to other lumps', async () => {
        createAndPushLumpBranch('my-lump', 'ctx-a');
        createAndPushLumpBranch('other-lump', 'ctx-b');
        createAndPushLumpBranch('other-lump', 'ctx-c');
        git('checkout main', projectRoot);

        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my-lump' });
        expect(count).toBe(1);
    });

    it('does not treat a lump name as a prefix of another (e.g. "my" vs "my-lump")', async () => {
        createAndPushLumpBranch('my-lump', 'ctx-a');
        git('checkout main', projectRoot);

        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my' });
        expect(count).toBe(0);
    });
});
