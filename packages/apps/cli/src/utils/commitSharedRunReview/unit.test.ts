import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTempTestDirs, removeTempTestDirs } from '../createTempTestDirs';
import { execGit } from '../execGit';
import { getGitCommitMessage } from '../getGitCommitMessage';
import { initBareRemoteAndCheckout } from '../initBareRemoteAndCheckout';
import { initLocalGitRepo } from '../initLocalGitRepo';
import { commitSharedRunReview } from './main';

describe('commitSharedRunReview (shared-run-review)', () => {
    let cwd: string;
    let remoteDir: string | undefined;

    beforeEach(async () => {
        ({ projectRoot: cwd, remoteDir } = await createTempTestDirs({
            prefix: 'lump-shared-run-review-commit-',
            global: false,
            mkdirLocalConfig: false,
        }));
    });

    afterEach(async () => {
        await removeTempTestDirs({ projectRoot: cwd, remoteDir });
    });

    it('creates one git add . commit with every marker joined by blank lines', async () => {
        initLocalGitRepo({ cwd });
        await fs.writeFile(path.join(cwd, 'DIRTY.txt'), 'walked\n', 'utf-8');
        const beforeCount = Number(execGit('rev-list --count HEAD', cwd));

        const result = await commitSharedRunReview({
            cwd,
            lumpName: 'myLump',
            contextNames: ['alpha', 'beta'],
        });

        expect(result.success).toBe(true);
        expect(Number(execGit('rev-list --count HEAD', cwd))).toBe(beforeCount + 1);
        expect(execGit('log -1 --format=%B', cwd).trim()).toBe(
            `${getGitCommitMessage({ lumpName: 'myLump', contextName: 'alpha' })}\n\n${getGitCommitMessage({ lumpName: 'myLump', contextName: 'beta' })}`,
        );
        expect(execGit('ls-tree -r --name-only HEAD', cwd).split('\n')).toContain('DIRTY.txt');
        expect(execGit('status --porcelain', cwd)).toBe('');
    });

    it('commits --allow-empty when the tree is clean', async () => {
        initLocalGitRepo({ cwd });
        expect(execGit('status --porcelain', cwd)).toBe('');
        const before = execGit('rev-parse HEAD', cwd);

        const result = await commitSharedRunReview({
            cwd,
            lumpName: 'myLump',
            contextNames: ['only'],
        });

        expect(result.success).toBe(true);
        expect(execGit('rev-parse HEAD', cwd)).not.toBe(before);
        expect(execGit('log -1 --format=%B', cwd).trim()).toBe(
            getGitCommitMessage({ lumpName: 'myLump', contextName: 'only' }),
        );
    });

    it('does not push', async () => {
        initBareRemoteAndCheckout({ projectRoot: cwd, remoteDir: remoteDir! });
        const originBefore = execGit('rev-parse origin/main', cwd);
        await fs.writeFile(path.join(cwd, 'LOCAL.txt'), 'stay local\n', 'utf-8');

        const result = await commitSharedRunReview({
            cwd,
            lumpName: 'myLump',
            contextNames: ['ctx'],
        });

        expect(result.success).toBe(true);
        expect(execGit('rev-parse HEAD', cwd)).not.toBe(originBefore);
        expect(execGit('rev-parse origin/main', cwd)).toBe(originBefore);
    });

    it('fails with sharedRunCommitFailed and git stderr', async () => {
        const result = await commitSharedRunReview({
            cwd,
            lumpName: 'myLump',
            contextNames: ['ctx'],
        });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.code).toBe('sharedRunCommitFailed');
        expect(result.data.message).toMatch(/not a git repository|fatal/i);
    });
});
