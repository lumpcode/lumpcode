import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setContextToFinishedStatus } from './main';
import { getContextStatus } from '../getContextStatus';
import { getGitCommitMessage } from '../getGitCommitMessage';
import { execGit } from '../execGit';
import { initBareRemoteAndCheckout } from '../initBareRemoteAndCheckout';

function headAndLocalBranches(cwd: string): string {
    const head = execGit('rev-parse HEAD', cwd);
    const branches = execGit("for-each-ref --format='%(refname) %(objectname)' refs/heads", cwd);
    return `${head}\n${branches}`;
}

describe('setContextToFinishedStatus', () => {
    let tmpDir: string;
    let remoteDir: string;
    const dateId = Date.now().toString();
    const lumpName = 'myLump';
    const baseBranch = 'main';

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `lump-set-finished-${dateId}-`));
        remoteDir = await fs.mkdtemp(path.join(os.tmpdir(), `lump-set-finished-remote-${dateId}-`));
        initBareRemoteAndCheckout({ projectRoot: tmpDir, remoteDir });
    });

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
        await fs.rm(remoteDir, { recursive: true, force: true });
    });

    it('creates an empty commit on baseBranch and pushes it, marking the context as finished', async () => {
        const result = await setContextToFinishedStatus({
            projectRoot: tmpDir,
            contextName: 'button',
            lumpName,
            baseBranch,
        });

        expect(result.success).toBe(true);

        const status = await getContextStatus({ projectRoot: tmpDir, contextName: 'button', lumpName, baseBranch });
        expect(status).toBe('finished');

        const expectedMessage = getGitCommitMessage({ contextName: 'button', lumpName });
        const remoteSubject = execGit('log -1 --format=%s origin/main', tmpDir);
        expect(remoteSubject).toBe(expectedMessage);
    });

    it('lands one empty marker on origin when local main is behind', async () => {
        const otherDir = await fs.mkdtemp(path.join(os.tmpdir(), `lump-set-finished-other-${dateId}-`));
        try {
            execGit(`clone -b main ${remoteDir} ${otherDir}`);
            execGit('config user.email "test@test.com"', otherDir);
            execGit('config user.name "Test"', otherDir);
            execGit('commit --allow-empty -m "squash"', otherDir);
            execGit('push origin main', otherDir);
            const squash = execGit('rev-parse HEAD', otherDir);

            const localMainBefore = execGit('rev-parse main', tmpDir);
            const headBefore = execGit('rev-parse HEAD', tmpDir);
            expect(localMainBefore).not.toBe(squash);

            const result = await setContextToFinishedStatus({
                projectRoot: tmpDir,
                contextName: 'button',
                lumpName,
                baseBranch,
            });

            expect(result.success).toBe(true);
            expect(execGit('rev-parse main', tmpDir)).toBe(localMainBefore);
            expect(execGit('rev-parse HEAD', tmpDir)).toBe(headBefore);
            expect(execGit('rev-parse origin/main^', tmpDir)).toBe(squash);

            const expectedMessage = getGitCommitMessage({ contextName: 'button', lumpName });
            expect(execGit('log -1 --format=%s origin/main', tmpDir)).toBe(expectedMessage);
            expect(execGit('diff-tree --no-commit-id --name-only -r origin/main', tmpDir)).toBe('');

            const status = await getContextStatus({ projectRoot: tmpDir, contextName: 'button', lumpName, baseBranch });
            expect(status).toBe('finished');
        } finally {
            await fs.rm(otherDir, { recursive: true, force: true });
        }
    });

    it('pushes an empty marker without changing a feature branch, its index, or its working tree', async () => {
        const localMainBefore = execGit('rev-parse main', tmpDir);
        execGit('switch -c feature/wip', tmpDir);
        const wipPath = path.join(tmpDir, 'wip.env');
        await fs.writeFile(wipPath, 'API_KEY=do-not-ship\n');
        execGit('add wip.env', tmpDir);

        const headBefore = execGit('rev-parse HEAD', tmpDir);
        const stagedBefore = execGit('diff --cached --name-only', tmpDir);
        const unstagedBefore = execGit('diff --name-only', tmpDir);
        const porcelainBefore = execGit('status --porcelain', tmpDir);
        const refsBefore = headAndLocalBranches(tmpDir);

        const result = await setContextToFinishedStatus({
            projectRoot: tmpDir,
            contextName: 'button',
            lumpName,
            baseBranch,
        });

        expect(result.success).toBe(true);
        expect(execGit('branch --show-current', tmpDir)).toBe('feature/wip');
        expect(execGit('rev-parse HEAD', tmpDir)).toBe(headBefore);
        expect(execGit('rev-parse main', tmpDir)).toBe(localMainBefore);
        expect(headAndLocalBranches(tmpDir)).toBe(refsBefore);
        expect(execGit('diff --cached --name-only', tmpDir)).toBe(stagedBefore);
        expect(execGit('diff --name-only', tmpDir)).toBe(unstagedBefore);
        expect(execGit('status --porcelain', tmpDir)).toBe(porcelainBefore);
        expect(await fs.readFile(wipPath, 'utf8')).toBe('API_KEY=do-not-ship\n');

        const expectedMessage = getGitCommitMessage({ contextName: 'button', lumpName });
        expect(execGit('log -1 --format=%s origin/main', tmpDir)).toBe(expectedMessage);
        expect(execGit('diff-tree --no-commit-id --name-only -r origin/main', tmpDir)).toBe('');
        expect(execGit('rev-parse origin/main^', tmpDir)).toBe(localMainBefore);
    });

    it('fails when the base branch is missing on origin and leaves local refs unchanged', async () => {
        const refsBefore = headAndLocalBranches(tmpDir);
        const result = await setContextToFinishedStatus({
            projectRoot: tmpDir,
            contextName: 'button',
            lumpName,
            baseBranch: 'no-such',
        });

        expect(result.success).toBe(false);
        if (result.success) {
            throw new Error('unreachable');
        }
        expect(result.data).toContain('origin/no-such');
        expect(headAndLocalBranches(tmpDir)).toBe(refsBefore);
    });

    it('no-ops when context is already finished', async () => {
        await setContextToFinishedStatus({
            projectRoot: tmpDir,
            contextName: 'button',
            lumpName,
            baseBranch,
        });

        const before = execGit('rev-parse main', tmpDir);

        const result = await setContextToFinishedStatus({
            projectRoot: tmpDir,
            contextName: 'button',
            lumpName,
            baseBranch,
        });

        expect(result.success).toBe(true);

        const after = execGit('rev-parse main', tmpDir);
        expect(after).toBe(before);
    });

    it('does not affect contexts of other lumps', async () => {
        await setContextToFinishedStatus({
            projectRoot: tmpDir,
            contextName: 'button',
            lumpName,
            baseBranch,
        });

        const otherStatus = await getContextStatus({
            projectRoot: tmpDir,
            contextName: 'button',
            lumpName: 'otherLump',
            baseBranch,
        });
        expect(otherStatus).toBe('toDo');
    });

    it('resolves cross-lump dependency markers when checking status', async () => {
        const depLumpName = 'depLump';
        const contextName = 'button';
        const message = getGitCommitMessage({ contextName, lumpName: depLumpName });
        execGit('checkout main', tmpDir);
        execGit(`commit --allow-empty -m "${message}"`, tmpDir);
        execGit('push origin main', tmpDir);

        const status = await getContextStatus({
            projectRoot: tmpDir,
            contextName: `${depLumpName}/${contextName}`,
            lumpName,
            baseBranch,
        });
        expect(status).toBe('finished');
    });
});
