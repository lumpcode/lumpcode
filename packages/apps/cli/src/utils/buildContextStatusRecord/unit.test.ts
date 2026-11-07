import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildContextStatusRecord } from './main';
import { createLumpWorkBranch } from '../../testing';
import { getGitCommitMessage } from '../getGitCommitMessage';
import { execGit } from '../execGit';
import { initBareRemoteAndCheckout } from '../initBareRemoteAndCheckout';

const lumpName = 'myLump';

function commitMsg(contextName: string, name: string = lumpName): string {
    return getGitCommitMessage({ contextName, lumpName: name });
}

describe('buildContextStatusRecord', () => {
    let tmpDir: string;
    let remoteDir: string;
    const dateId = Date.now().toString();

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `lump-build-bcsr-${dateId}-`));
        remoteDir = await fs.mkdtemp(path.join(os.tmpdir(), `lump-build-bcsr-remote-${dateId}-`));
        initBareRemoteAndCheckout({ projectRoot: tmpDir, remoteDir });
    });

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
        await fs.rm(remoteDir, { recursive: true, force: true });
    });

    it('should return an empty record when no matching commits exist', async () => {
        const result = await buildContextStatusRecord({ projectRoot: tmpDir, lumpName, baseBranch: 'main' });
        expect(result.success).toBe(true);
        expect(result.data).toEqual({});
    });

    it('should return branchPushed for commits on a remote branch', async () => {
        const branchName = createLumpWorkBranch({ projectRoot: tmpDir, lumpName, contextName: 'button', useMarkerMessage: true });

        const result = await buildContextStatusRecord({ projectRoot: tmpDir, lumpName, baseBranch: 'main' });
        expect(result.success).toBe(true);

        expect(result.data).toEqual({
            button: {
                status: 'branchPushed',
                contextName: 'button',
                branchName,
                commitMessage: commitMsg('button'),
            },
        });
    });

    it('should return finished for commits merged into base branch', async () => {
        execGit('checkout -b temp-branch', tmpDir);
        execGit(`commit --allow-empty -m "${commitMsg('form')}"`, tmpDir);
        execGit('checkout main', tmpDir);
        execGit('merge temp-branch', tmpDir);
        execGit('branch -d temp-branch', tmpDir);
        execGit('push origin main', tmpDir);

        const result = await buildContextStatusRecord({ projectRoot: tmpDir, lumpName, baseBranch: 'main' });
        if (!result.success) throw new Error('unreachable');
        expect(result.data.form.status).toBe('finished');
        expect(result.data.form.commitMessage).toBe(commitMsg('form'));
    });

    it('should ignore commits that exist only locally (never pushed)', async () => {
        execGit('checkout -b local-only', tmpDir);
        execGit(`commit --allow-empty -m "${commitMsg('button')}"`, tmpDir);
        execGit('checkout main', tmpDir);

        const result = await buildContextStatusRecord({ projectRoot: tmpDir, lumpName, baseBranch: 'main' });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');

        expect(result.data).toEqual({});
    });

    it('should handle multiple contexts with different statuses', async () => {
        createLumpWorkBranch({ projectRoot: tmpDir, lumpName, contextName: 'card', useMarkerMessage: true });

        execGit('checkout main', tmpDir);
        execGit('checkout -b merge-branch', tmpDir);
        execGit(`commit --allow-empty -m "${commitMsg('form')}"`, tmpDir);
        execGit('checkout main', tmpDir);
        execGit('merge merge-branch', tmpDir);
        execGit('branch -d merge-branch', tmpDir);
        execGit('push origin main', tmpDir);

        const result = await buildContextStatusRecord({ projectRoot: tmpDir, lumpName, baseBranch: 'main' });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');

        expect(Object.keys(result.data)).toHaveLength(2);
        expect(result.data.card.status).toBe('branchPushed');
        expect(result.data.form.status).toBe('finished');
    });

    it('should only include commits matching the given lump name', async () => {
        createLumpWorkBranch({ projectRoot: tmpDir, lumpName, contextName: 'button', useMarkerMessage: true });
        createLumpWorkBranch({ projectRoot: tmpDir, lumpName: 'otherLump', contextName: 'form', useMarkerMessage: true });

        const result = await buildContextStatusRecord({ projectRoot: tmpDir, lumpName, baseBranch: 'main' });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');

        expect(Object.keys(result.data)).toEqual(['button']);
    });

    it('discovers context names from marker strings in the commit body', async () => {
        createLumpWorkBranch({
            projectRoot: tmpDir,
            lumpName,
            contextName: 'batch',
            message: 'PR title',
            commitBody: `* ${commitMsg('button')}, ${commitMsg('form')}`,
        });

        const result = await buildContextStatusRecord({ projectRoot: tmpDir, lumpName, baseBranch: 'main' });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');

        expect(result.data.button?.status).toBe('branchPushed');
        expect(result.data.form?.status).toBe('branchPushed');
        expect(result.data.button?.commitMessage).toBe(commitMsg('button'));
        expect(result.data.form?.commitMessage).toBe(commitMsg('form'));
    });
});
