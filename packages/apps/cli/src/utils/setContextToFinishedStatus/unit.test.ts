import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setContextToFinishedStatus } from './main';
import { getContextStatus } from '../getContextStatus';
import { getGitCommitMessage } from '../getGitCommitMessage';
import { execGit } from '../execGit';
import { initBareRemoteAndCheckout } from '../initBareRemoteAndCheckout';

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
        const lastSubject = execGit('log -1 --format=%s main', tmpDir);
        expect(lastSubject).toBe(expectedMessage);

        const remoteSubject = execGit('log -1 --format=%s origin/main', tmpDir);
        expect(remoteSubject).toBe(expectedMessage);
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
