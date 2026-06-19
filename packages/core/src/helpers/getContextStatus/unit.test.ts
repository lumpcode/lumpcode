import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execAsync } from '../execAsync';
import { getContextStatus } from './main';
import type { GitCommitMessageFn } from '../../types/GitCommitMessageFn';

const baseBranch = 'main';
const contextName = 'feat';
const gitCommitMessageFn: GitCommitMessageFn = ({ context }) => `LUMP:${context.name}`;
const commitMessage = gitCommitMessageFn({ context: { name: contextName, variables: {} }, lumpVariables: {}, baseBranch });

async function git(projectRoot: string, cmd: string) {
    return execAsync(`git ${cmd}`, { cwd: projectRoot });
}

describe('getContextStatus', () => {
    let projectRoot: string;

    beforeEach(async () => {
        projectRoot = await mkdtemp(join(tmpdir(), 'ctx-test-'));
        await git(projectRoot, 'init -b main');
        await git(projectRoot, 'config user.email "test@test.com"');
        await git(projectRoot, 'config user.name "Test"');
        await git(projectRoot, 'commit --allow-empty -m "init"');
    });

    afterEach(async () => {
        await rm(projectRoot, { recursive: true });
    });

    it('returns "toDo" when no matching commit exists', async () => {
        expect(await getContextStatus({ contextName, gitCommitMessageFn, projectRoot, baseBranch })).toBe('toDo');
    });

    it('returns "toDo" when matching commit exists only on a local branch (not pushed)', async () => {
        await git(projectRoot, 'checkout -b feat-branch');
        await git(projectRoot, `commit --allow-empty -m "${commitMessage}"`);

        expect(await getContextStatus({ contextName, gitCommitMessageFn, projectRoot, baseBranch })).toBe('toDo');
    });

    it('returns "branchPushed" when matching commit exists on a remote branch', async () => {
        const remoteDir = await mkdtemp(join(tmpdir(), 'ctx-remote-'));
        await git(remoteDir, 'init --bare');
        await git(projectRoot, `remote add origin ${remoteDir}`);
        await git(projectRoot, 'push -u origin main');
        await git(projectRoot, 'checkout -b feat-branch');
        await git(projectRoot, `commit --allow-empty -m "${commitMessage}"`);
        await git(projectRoot, 'push origin feat-branch');

        expect(await getContextStatus({ contextName, gitCommitMessageFn, projectRoot, baseBranch })).toBe('branchPushed');
        await rm(remoteDir, { recursive: true });
    });

    it('returns "finished" when matching commit is merged into remote base branch', async () => {
        const remoteDir = await mkdtemp(join(tmpdir(), 'ctx-remote-'));
        await git(remoteDir, 'init --bare');
        await git(projectRoot, `remote add origin ${remoteDir}`);
        await git(projectRoot, 'push -u origin main');
        await git(projectRoot, 'checkout -b feat-branch');
        await git(projectRoot, `commit --allow-empty -m "${commitMessage}"`);
        await git(projectRoot, 'push origin feat-branch');
        await git(projectRoot, 'checkout main');
        await git(projectRoot, 'merge feat-branch');
        await git(projectRoot, 'push origin main');

        expect(await getContextStatus({ contextName, gitCommitMessageFn, projectRoot, baseBranch })).toBe('finished');
        await rm(remoteDir, { recursive: true });
    });

    it('returns "toDo" when matching commit is merged locally but remote base does not include it', async () => {
        const remoteDir = await mkdtemp(join(tmpdir(), 'ctx-remote-'));
        await git(remoteDir, 'init --bare');
        await git(projectRoot, `remote add origin ${remoteDir}`);
        await git(projectRoot, 'push -u origin main');
        await git(projectRoot, 'checkout -b feat-branch');
        await git(projectRoot, `commit --allow-empty -m "${commitMessage}"`);
        await git(projectRoot, 'checkout main');
        await git(projectRoot, 'merge feat-branch');

        expect(await getContextStatus({ contextName, gitCommitMessageFn, projectRoot, baseBranch })).toBe('toDo');
        await rm(remoteDir, { recursive: true });
    });

    it('returns "toDo" when local-only branch was deleted without merging', async () => {
        await git(projectRoot, 'checkout -b temp-branch');
        await git(projectRoot, `commit --allow-empty -m "${commitMessage}"`);
        await git(projectRoot, 'checkout main');
        await git(projectRoot, 'branch -D temp-branch');

        expect(await getContextStatus({ contextName, gitCommitMessageFn, projectRoot, baseBranch })).toBe('toDo');
    });

    it('does not match commits whose subject only contains the message as a substring', async () => {
        const remoteDir = await mkdtemp(join(tmpdir(), 'ctx-remote-'));
        await git(remoteDir, 'init --bare');
        await git(projectRoot, `remote add origin ${remoteDir}`);
        await git(projectRoot, 'push -u origin main');
        await git(projectRoot, 'checkout -b feat-branch');
        await git(projectRoot, `commit --allow-empty -m "${commitMessage} and more"`);
        await git(projectRoot, 'push origin feat-branch');

        expect(await getContextStatus({ contextName, gitCommitMessageFn, projectRoot, baseBranch })).toBe('toDo');
        await rm(remoteDir, { recursive: true });
    });

    it('uses the provided gitCommitMessageFn to compute the commit message', async () => {
        const customFn: GitCommitMessageFn = ({ context }) => `custom::${context.name}`;

        const remoteDir = await mkdtemp(join(tmpdir(), 'ctx-remote-'));
        await git(remoteDir, 'init --bare');
        await git(projectRoot, `remote add origin ${remoteDir}`);
        await git(projectRoot, 'push -u origin main');
        await git(projectRoot, 'checkout -b feat-branch');
        await git(projectRoot, `commit --allow-empty -m "custom::feat"`);
        await git(projectRoot, 'push origin feat-branch');

        expect(await getContextStatus({ contextName: 'feat', gitCommitMessageFn: customFn, projectRoot, baseBranch })).toBe('branchPushed');
        expect(await getContextStatus({ contextName: 'feat', gitCommitMessageFn, projectRoot, baseBranch })).toBe('toDo');
        await rm(remoteDir, { recursive: true });
    });
});
