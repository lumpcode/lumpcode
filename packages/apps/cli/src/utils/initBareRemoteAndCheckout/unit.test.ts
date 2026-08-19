import { afterEach, describe, expect, it, vi } from 'vitest';

import { execGit } from '../execGit';
import { initLocalGitRepo } from '../initLocalGitRepo';
import { initBareRemoteAndCheckout } from './main';

vi.mock('../execGit', () => ({
    execGit: vi.fn(),
}));

vi.mock('../initLocalGitRepo', () => ({
    initLocalGitRepo: vi.fn(),
}));

describe('initBareRemoteAndCheckout', () => {
    afterEach(() => {
        vi.mocked(execGit).mockClear();
        vi.mocked(initLocalGitRepo).mockClear();
    });

    it('with defaults invokes bare init, initLocalGitRepo, remote add, and push -u origin main', () => {
        initBareRemoteAndCheckout({
            projectRoot: '/tmp/project',
            remoteDir: '/tmp/remote',
        });

        expect(vi.mocked(execGit).mock.calls).toEqual([
            ['init --bare', '/tmp/remote'],
            ['remote add origin /tmp/remote', '/tmp/project'],
            ['push -u origin main', '/tmp/project'],
        ]);
        expect(vi.mocked(initLocalGitRepo)).toHaveBeenCalledTimes(1);
        expect(vi.mocked(initLocalGitRepo)).toHaveBeenCalledWith({
            cwd: '/tmp/project',
            branch: 'main',
            userEmail: undefined,
            userName: undefined,
            initialCommitMessage: undefined,
        });
        const bareOrder = vi.mocked(execGit).mock.invocationCallOrder[0]!;
        const localOrder = vi.mocked(initLocalGitRepo).mock.invocationCallOrder[0]!;
        const remoteOrder = vi.mocked(execGit).mock.invocationCallOrder[1]!;
        const pushOrder = vi.mocked(execGit).mock.invocationCallOrder[2]!;
        expect(bareOrder).toBeLessThan(localOrder);
        expect(localOrder).toBeLessThan(remoteOrder);
        expect(remoteOrder).toBeLessThan(pushOrder);
    });

    it('honors branch, userEmail, userName, and initialCommitMessage', () => {
        initBareRemoteAndCheckout({
            projectRoot: '/tmp/custom',
            remoteDir: '/tmp/bare',
            branch: 'dev',
            userEmail: 'e2e@t.com',
            userName: 'E2E',
            initialCommitMessage: 'bootstrap',
        });

        expect(vi.mocked(initLocalGitRepo)).toHaveBeenCalledWith({
            cwd: '/tmp/custom',
            branch: 'dev',
            userEmail: 'e2e@t.com',
            userName: 'E2E',
            initialCommitMessage: 'bootstrap',
        });
        expect(vi.mocked(execGit).mock.calls).toEqual([
            ['init --bare', '/tmp/bare'],
            ['remote add origin /tmp/bare', '/tmp/custom'],
            ['push -u origin dev', '/tmp/custom'],
        ]);
    });

    it('only calls execGit and initLocalGitRepo (no config file writes)', () => {
        initBareRemoteAndCheckout({
            projectRoot: '/tmp/project',
            remoteDir: '/tmp/remote',
        });

        expect(vi.mocked(execGit)).toHaveBeenCalledTimes(3);
        expect(vi.mocked(initLocalGitRepo)).toHaveBeenCalledTimes(1);
    });
});
