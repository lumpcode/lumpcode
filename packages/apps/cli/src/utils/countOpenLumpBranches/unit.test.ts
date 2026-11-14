import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { shellSingleQuote } from '@lumpcode/core';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { LUMP_BRANCH_PREFIX } from '../../consts';
import { createLumpWorkBranch } from '../../testing';
import { execGit } from '../execGit';
import { getGitCommitMessage } from '../getGitCommitMessage';
import { initBareRemoteAndCheckout } from '../initBareRemoteAndCheckout';
import { createTempTestDirs, removeTempTestDirs } from '../createTempTestDirs';
import { countOpenLumpBranches } from './main';

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

    it('does not count a lump branch merged into main with a merge commit', async () => {
        createLumpWorkBranch({ projectRoot, lumpName: 'my-lump', contextName: 'ctx-a' });
        execGit('checkout main', projectRoot);
        execGit(`merge --no-ff ${LUMP_BRANCH_PREFIX}my-lump/ctx-a -m "merge"`, projectRoot);
        execGit('push origin main', projectRoot);
        execGit('fetch origin main', projectRoot);

        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my-lump' });
        expect(count).toBe(0);
    });

    it('does not count a lump branch fast-forwarded into main', async () => {
        createLumpWorkBranch({ projectRoot, lumpName: 'my-lump', contextName: 'ctx-a' });
        execGit('checkout main', projectRoot);
        execGit(`merge --ff-only ${LUMP_BRANCH_PREFIX}my-lump/ctx-a`, projectRoot);
        execGit('push origin main', projectRoot);
        execGit('fetch origin main', projectRoot);

        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my-lump' });
        expect(count).toBe(0);
    });

    it('counts the unmerged branch when another lump branch is already merged', async () => {
        createLumpWorkBranch({ projectRoot, lumpName: 'my-lump', contextName: 'ctx-a' });
        execGit('checkout main', projectRoot);
        execGit(`merge --no-ff ${LUMP_BRANCH_PREFIX}my-lump/ctx-a -m "merge"`, projectRoot);
        execGit('push origin main', projectRoot);
        execGit('fetch origin main', projectRoot);
        createLumpWorkBranch({ projectRoot, lumpName: 'my-lump', contextName: 'ctx-b' });
        execGit('checkout main', projectRoot);

        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my-lump' });
        expect(count).toBe(1);
    });

    it('still counts a squash-merged lump branch whose commits have no marker line', async () => {
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

    it('does not count a squash-merged branch when the squash message keeps the marker line', async () => {
        const branch = `${LUMP_BRANCH_PREFIX}my-lump/ctx-a`;
        const marker = getGitCommitMessage({ lumpName: 'my-lump', contextName: 'ctx-a' });
        execGit('checkout main', projectRoot);
        execGit(`checkout -b ${branch}`, projectRoot);
        await fs.writeFile(path.join(projectRoot, 'note.txt'), 'squash me\n');
        execGit('add note.txt', projectRoot);
        execGit(`commit -m ${shellSingleQuote(marker)}`, projectRoot);
        execGit(`push origin ${branch}`, projectRoot);
        execGit('checkout main', projectRoot);
        execGit(`merge --squash ${branch}`, projectRoot);
        execGit(`commit -m ${shellSingleQuote('Squash')} -m ${shellSingleQuote(marker)}`, projectRoot);
        execGit('push origin main', projectRoot);
        execGit('fetch origin main', projectRoot);

        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my-lump' });
        expect(count).toBe(0);
    });

    it('still counts a squash-merged branch when the squash message drops the marker line', async () => {
        const branch = `${LUMP_BRANCH_PREFIX}my-lump/ctx-a`;
        const marker = getGitCommitMessage({ lumpName: 'my-lump', contextName: 'ctx-a' });
        execGit('checkout main', projectRoot);
        execGit(`checkout -b ${branch}`, projectRoot);
        await fs.writeFile(path.join(projectRoot, 'note.txt'), 'squash me\n');
        execGit('add note.txt', projectRoot);
        execGit(`commit -m ${shellSingleQuote(marker)}`, projectRoot);
        execGit(`push origin ${branch}`, projectRoot);
        execGit('checkout main', projectRoot);
        execGit(`merge --squash ${branch}`, projectRoot);
        execGit(`commit -m ${shellSingleQuote('Squash')}`, projectRoot);
        execGit('push origin main', projectRoot);
        execGit('fetch origin main', projectRoot);

        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my-lump' });
        expect(count).toBe(1);
    });

    it('does not count a branch whose marker commit was rewritten onto main', async () => {
        const branch = `${LUMP_BRANCH_PREFIX}my-lump/ctx-a`;
        const marker = getGitCommitMessage({ lumpName: 'my-lump', contextName: 'ctx-a' });
        execGit('checkout main', projectRoot);
        execGit(`checkout -b ${branch}`, projectRoot);
        await fs.writeFile(path.join(projectRoot, 'note.txt'), 'rebase me\n');
        execGit('add note.txt', projectRoot);
        execGit(`commit -m ${shellSingleQuote(marker)}`, projectRoot);
        execGit(`push origin ${branch}`, projectRoot);
        const hash = execGit('rev-parse HEAD', projectRoot);
        execGit('checkout main', projectRoot);
        execGit(`cherry-pick ${hash}`, projectRoot);
        execGit('push origin main', projectRoot);
        execGit('fetch origin main', projectRoot);

        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my-lump' });
        expect(count).toBe(0);
    });

    it('does not count a branch when every marker line it carries is on main', async () => {
        const branch = `${LUMP_BRANCH_PREFIX}my-lump/batch`;
        const markerA = getGitCommitMessage({ lumpName: 'my-lump', contextName: 'ctx-a' });
        const markerB = getGitCommitMessage({ lumpName: 'my-lump', contextName: 'ctx-b' });
        execGit('checkout main', projectRoot);
        execGit(`checkout -b ${branch}`, projectRoot);
        await fs.writeFile(path.join(projectRoot, 'a.txt'), 'a\n');
        execGit('add a.txt', projectRoot);
        execGit(`commit -m ${shellSingleQuote(markerA)}`, projectRoot);
        await fs.writeFile(path.join(projectRoot, 'b.txt'), 'b\n');
        execGit('add b.txt', projectRoot);
        execGit(`commit -m ${shellSingleQuote(markerB)}`, projectRoot);
        execGit(`push origin ${branch}`, projectRoot);
        execGit('checkout main', projectRoot);
        execGit(`merge --squash ${branch}`, projectRoot);
        execGit(
            `commit -m ${shellSingleQuote('Squash')} -m ${shellSingleQuote(`${markerA}\n${markerB}`)}`,
            projectRoot,
        );
        execGit('push origin main', projectRoot);
        execGit('fetch origin main', projectRoot);

        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my-lump' });
        expect(count).toBe(0);
    });

    it('still counts a branch when one of its marker lines is missing from main', async () => {
        const branch = `${LUMP_BRANCH_PREFIX}my-lump/batch`;
        const markerA = getGitCommitMessage({ lumpName: 'my-lump', contextName: 'ctx-a' });
        const markerB = getGitCommitMessage({ lumpName: 'my-lump', contextName: 'ctx-b' });
        execGit('checkout main', projectRoot);
        execGit(`checkout -b ${branch}`, projectRoot);
        await fs.writeFile(path.join(projectRoot, 'a.txt'), 'a\n');
        execGit('add a.txt', projectRoot);
        execGit(`commit -m ${shellSingleQuote(markerA)}`, projectRoot);
        await fs.writeFile(path.join(projectRoot, 'b.txt'), 'b\n');
        execGit('add b.txt', projectRoot);
        execGit(`commit -m ${shellSingleQuote(markerB)}`, projectRoot);
        execGit(`push origin ${branch}`, projectRoot);
        execGit('checkout main', projectRoot);
        execGit(`merge --squash ${branch}`, projectRoot);
        execGit(`commit -m ${shellSingleQuote('Squash')} -m ${shellSingleQuote(markerA)}`, projectRoot);
        execGit('push origin main', projectRoot);
        execGit('fetch origin main', projectRoot);

        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my-lump' });
        expect(count).toBe(1);
    });

    it('does not count a branch whose marker line is on main when a later commit adds no new marker', async () => {
        const branch = `${LUMP_BRANCH_PREFIX}my-lump/ctx-a`;
        const marker = getGitCommitMessage({ lumpName: 'my-lump', contextName: 'ctx-a' });
        execGit('checkout main', projectRoot);
        execGit(`checkout -b ${branch}`, projectRoot);
        await fs.writeFile(path.join(projectRoot, 'note.txt'), 'squash me\n');
        execGit('add note.txt', projectRoot);
        execGit(`commit -m ${shellSingleQuote(marker)}`, projectRoot);
        await fs.writeFile(path.join(projectRoot, 'note.txt'), 'address review\n');
        execGit('add note.txt', projectRoot);
        execGit(`commit -m ${shellSingleQuote('address review')}`, projectRoot);
        execGit(`push origin ${branch}`, projectRoot);
        execGit('checkout main', projectRoot);
        execGit(`merge --squash ${branch}`, projectRoot);
        execGit(`commit -m ${shellSingleQuote('Squash')} -m ${shellSingleQuote(marker)}`, projectRoot);
        execGit('push origin main', projectRoot);
        execGit('fetch origin main', projectRoot);

        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my-lump' });
        expect(count).toBe(0);
    });

    it('counts a branch when a later commit adds a marker line that is not on main', async () => {
        const branch = `${LUMP_BRANCH_PREFIX}my-lump/ctx-a`;
        const markerA = getGitCommitMessage({ lumpName: 'my-lump', contextName: 'ctx-a' });
        const markerB = getGitCommitMessage({ lumpName: 'my-lump', contextName: 'ctx-b' });
        execGit('checkout main', projectRoot);
        execGit(`checkout -b ${branch}`, projectRoot);
        await fs.writeFile(path.join(projectRoot, 'note.txt'), 'squash me\n');
        execGit('add note.txt', projectRoot);
        execGit(`commit -m ${shellSingleQuote(markerA)}`, projectRoot);
        execGit(`push origin ${branch}`, projectRoot);
        execGit('checkout main', projectRoot);
        execGit(`merge --squash ${branch}`, projectRoot);
        execGit(`commit -m ${shellSingleQuote('Squash')} -m ${shellSingleQuote(markerA)}`, projectRoot);
        execGit('push origin main', projectRoot);
        execGit('fetch origin main', projectRoot);
        execGit(`checkout ${branch}`, projectRoot);
        await fs.writeFile(path.join(projectRoot, 'more.txt'), 'more\n');
        execGit('add more.txt', projectRoot);
        execGit(`commit -m ${shellSingleQuote(markerB)}`, projectRoot);
        execGit(`push origin ${branch}`, projectRoot);
        execGit('checkout main', projectRoot);

        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my-lump' });
        expect(count).toBe(1);
    });

    it('still counts when main has a shorter context name than the branch marker', async () => {
        const branch = `${LUMP_BRANCH_PREFIX}my-lump/foo-bar`;
        const marker = getGitCommitMessage({ lumpName: 'my-lump', contextName: 'foo-bar' });
        const shorter = getGitCommitMessage({ lumpName: 'my-lump', contextName: 'foo' });
        execGit('checkout main', projectRoot);
        execGit(`checkout -b ${branch}`, projectRoot);
        await fs.writeFile(path.join(projectRoot, 'note.txt'), 'longer name\n');
        execGit('add note.txt', projectRoot);
        execGit(`commit -m ${shellSingleQuote(marker)}`, projectRoot);
        execGit(`push origin ${branch}`, projectRoot);
        execGit('checkout main', projectRoot);
        execGit(`commit --allow-empty -m ${shellSingleQuote(shorter)}`, projectRoot);
        execGit('push origin main', projectRoot);
        execGit('fetch origin main', projectRoot);

        const count = await countOpenLumpBranches({ executionWorkspacePath: projectRoot, lumpName: 'my-lump' });
        expect(count).toBe(1);
    });

    it('counts an unmerged branch that carries a marker line', async () => {
        createLumpWorkBranch({
            projectRoot,
            lumpName: 'my-lump',
            contextName: 'ctx-a',
            useMarkerMessage: true,
        });

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
