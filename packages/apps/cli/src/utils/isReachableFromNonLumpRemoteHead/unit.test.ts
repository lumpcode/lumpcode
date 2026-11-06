import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { LUMP_BRANCH_PREFIX } from '../../consts';
import { execGit } from '../execGit';
import { initBareRemoteAndCheckout } from '../initBareRemoteAndCheckout';
import { createTempTestDirs, removeTempTestDirs } from '../createTempTestDirs';
import { isNonLumpRemoteTrackingRef, isReachableFromNonLumpRemoteHead } from './main';

describe('isNonLumpRemoteTrackingRef', () => {
    it('is true for non-lump remote-tracking heads and false otherwise', () => {
        expect(isNonLumpRemoteTrackingRef('origin/main')).toBe(true);
        expect(isNonLumpRemoteTrackingRef('origin/HEAD')).toBe(true);
        expect(isNonLumpRemoteTrackingRef('upstream/dev')).toBe(true);
        expect(isNonLumpRemoteTrackingRef('origin/lump/x/y')).toBe(false);
        expect(isNonLumpRemoteTrackingRef('main')).toBe(false);
    });
});

describe('isReachableFromNonLumpRemoteHead', () => {
    let projectRoot: string;
    let remoteDir: string;

    beforeEach(async () => {
        ({ projectRoot, remoteDir } = await createTempTestDirs({ prefix: 'lump-reachable-', global: false }));
        initBareRemoteAndCheckout({ projectRoot, remoteDir });
    });

    afterEach(async () => {
        await removeTempTestDirs({ projectRoot, remoteDir });
    });

    function pushLumpCommit(lumpName: string, contextName: string): { branch: string; hash: string } {
        const branch = `${LUMP_BRANCH_PREFIX}${lumpName}/${contextName}`;
        execGit('checkout main', projectRoot);
        execGit(`checkout -b ${branch}`, projectRoot);
        execGit('commit --allow-empty -m "lump work"', projectRoot);
        const hash = execGit('rev-parse HEAD', projectRoot);
        execGit(`push origin ${branch}`, projectRoot);
        return { branch, hash };
    }

    it('returns true after the commit is merged into origin/main and fetched', async () => {
        const { branch, hash } = pushLumpCommit('my-lump', 'ctx-a');
        execGit('checkout main', projectRoot);
        execGit(`merge --no-ff ${branch} -m "merge"`, projectRoot);
        execGit('push origin main', projectRoot);
        execGit('fetch origin main', projectRoot);

        await expect(isReachableFromNonLumpRemoteHead({ cwd: projectRoot, commitHash: hash })).resolves.toBe(true);
    });

    it('returns true when the commit is reachable from origin/dev and not from origin/main', async () => {
        const { hash } = pushLumpCommit('my-lump', 'ctx-a');
        execGit('checkout -b dev', projectRoot);
        execGit('push origin dev', projectRoot);
        execGit('fetch origin', projectRoot);

        await expect(isReachableFromNonLumpRemoteHead({ cwd: projectRoot, commitHash: hash })).resolves.toBe(true);
    });

    it('returns false for an unmerged commit', async () => {
        execGit('checkout main', projectRoot);
        execGit('checkout -b topic', projectRoot);
        execGit('commit --allow-empty -m "unmerged"', projectRoot);
        const hash = execGit('rev-parse HEAD', projectRoot);

        await expect(isReachableFromNonLumpRemoteHead({ cwd: projectRoot, commitHash: hash })).resolves.toBe(false);
    });

    it('returns false when only an origin/lump ref contains the commit', async () => {
        const { hash } = pushLumpCommit('my-lump', 'ctx-a');
        execGit('checkout main', projectRoot);

        await expect(isReachableFromNonLumpRemoteHead({ cwd: projectRoot, commitHash: hash })).resolves.toBe(false);
    });

    it('returns false for an unknown hash', async () => {
        await expect(
            isReachableFromNonLumpRemoteHead({
                cwd: projectRoot,
                commitHash: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
            }),
        ).resolves.toBe(false);
    });

    it('returns false when git cannot run in cwd', async () => {
        const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-reachable-empty-'));
        try {
            await expect(
                isReachableFromNonLumpRemoteHead({
                    cwd: emptyDir,
                    commitHash: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
                }),
            ).resolves.toBe(false);
        } finally {
            await fs.rm(emptyDir, { recursive: true, force: true });
        }
    });
});
