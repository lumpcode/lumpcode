import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildContextStatusRecord } from './main';
import { LUMP_BRANCH_PREFIX } from '../../consts';
import { getGitCommitMessage } from '../getGitCommitMessage';

function git(cmd: string, cwd: string) {
    execSync(`git ${cmd}`, { cwd, stdio: 'pipe' });
}

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
        git('init --bare', remoteDir);
        git('init -b main', tmpDir);
        git('config user.email "test@test.com"', tmpDir);
        git('config user.name "Test"', tmpDir);
        git('commit --allow-empty -m "init"', tmpDir);
        git(`remote add origin ${remoteDir}`, tmpDir);
        git('push -u origin main', tmpDir);
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
        const branchName = `${LUMP_BRANCH_PREFIX}myLump/button`;
        git(`checkout -b ${branchName}`, tmpDir);
        git(`commit --allow-empty -m "${commitMsg('button')}"`, tmpDir);
        git(`push origin ${branchName}`, tmpDir);

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
        git('checkout -b temp-branch', tmpDir);
        git(`commit --allow-empty -m "${commitMsg('form')}"`, tmpDir);
        git('checkout main', tmpDir);
        git('merge temp-branch', tmpDir);
        git('branch -d temp-branch', tmpDir);
        git('push origin main', tmpDir);

        const result = await buildContextStatusRecord({ projectRoot: tmpDir, lumpName, baseBranch: 'main' });
        if (!result.success) throw new Error('unreachable');
        expect(result.data.form.status).toBe('finished');
        expect(result.data.form.commitMessage).toBe(commitMsg('form'));
    });

    it('should ignore commits that exist only locally (never pushed)', async () => {
        git('checkout -b local-only', tmpDir);
        git(`commit --allow-empty -m "${commitMsg('button')}"`, tmpDir);
        git('checkout main', tmpDir);

        const result = await buildContextStatusRecord({ projectRoot: tmpDir, lumpName, baseBranch: 'main' });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');

        expect(result.data).toEqual({});
    });

    it('should handle multiple contexts with different statuses', async () => {
        const cardBranch = `${LUMP_BRANCH_PREFIX}myLump/card`;
        git(`checkout -b ${cardBranch}`, tmpDir);
        git(`commit --allow-empty -m "${commitMsg('card')}"`, tmpDir);
        git(`push origin ${cardBranch}`, tmpDir);

        git('checkout main', tmpDir);
        git('checkout -b merge-branch', tmpDir);
        git(`commit --allow-empty -m "${commitMsg('form')}"`, tmpDir);
        git('checkout main', tmpDir);
        git('merge merge-branch', tmpDir);
        git('branch -d merge-branch', tmpDir);
        git('push origin main', tmpDir);

        const result = await buildContextStatusRecord({ projectRoot: tmpDir, lumpName, baseBranch: 'main' });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');

        expect(Object.keys(result.data)).toHaveLength(2);
        expect(result.data.card.status).toBe('branchPushed');
        expect(result.data.form.status).toBe('finished');
    });

    it('should only include commits matching the given lump name', async () => {
        const branch1 = `${LUMP_BRANCH_PREFIX}myLump/button`;
        const branch2 = `${LUMP_BRANCH_PREFIX}otherLump/form`;
        git(`checkout -b ${branch1}`, tmpDir);
        git(`commit --allow-empty -m "${commitMsg('button', 'myLump')}"`, tmpDir);
        git(`push origin ${branch1}`, tmpDir);
        git('checkout main', tmpDir);
        git(`checkout -b ${branch2}`, tmpDir);
        git(`commit --allow-empty -m "${commitMsg('form', 'otherLump')}"`, tmpDir);
        git(`push origin ${branch2}`, tmpDir);

        const result = await buildContextStatusRecord({ projectRoot: tmpDir, lumpName, baseBranch: 'main' });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');

        expect(Object.keys(result.data)).toEqual(['button']);
    });

    it('should handle context names containing slashes', async () => {
        const branchName = `${LUMP_BRANCH_PREFIX}myLump/components/button`;
        git(`checkout -b ${branchName}`, tmpDir);
        git(`commit --allow-empty -m "${commitMsg('components/button')}"`, tmpDir);
        git(`push origin ${branchName}`, tmpDir);

        const result = await buildContextStatusRecord({ projectRoot: tmpDir, lumpName, baseBranch: 'main' });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');

        expect(result.data['components/button']).toBeDefined();
        expect(result.data['components/button'].commitMessage).toBe(commitMsg('components/button'));
    });
});
