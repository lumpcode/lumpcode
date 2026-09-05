import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { execGit } from '../execGit';
import { initLocalGitRepo } from '../initLocalGitRepo';
import { initBareRemoteAndCheckout } from './main';

vi.mock('../execGit', () => ({
    execGit: vi.fn(),
}));

vi.mock('../initLocalGitRepo', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../initLocalGitRepo')>();
    return {
        ...actual,
        initLocalGitRepo: vi.fn(),
    };
});

const tmpProject = path.join(os.tmpdir(), 'lump-init-bare-project');
const tmpRemote = path.join(os.tmpdir(), 'lump-init-bare-remote');
const tmpCustom = path.join(os.tmpdir(), 'lump-init-bare-custom');
const tmpBare = path.join(os.tmpdir(), 'lump-init-bare-origin');

describe('initBareRemoteAndCheckout', () => {
    afterEach(() => {
        vi.mocked(execGit).mockClear();
        vi.mocked(initLocalGitRepo).mockClear();
    });

    it('with defaults invokes bare init, initLocalGitRepo, remote add, and push -u origin main', () => {
        initBareRemoteAndCheckout({
            projectRoot: tmpProject,
            remoteDir: tmpRemote,
        });

        expect(vi.mocked(execGit).mock.calls).toEqual([
            ['init --bare', tmpRemote],
            [`remote add origin ${tmpRemote}`, tmpProject],
            ['push -u origin main', tmpProject],
        ]);
        expect(vi.mocked(initLocalGitRepo)).toHaveBeenCalledTimes(1);
        expect(vi.mocked(initLocalGitRepo)).toHaveBeenCalledWith({
            cwd: tmpProject,
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
            projectRoot: tmpCustom,
            remoteDir: tmpBare,
            branch: 'dev',
            userEmail: 'e2e@t.com',
            userName: 'E2E',
            initialCommitMessage: 'bootstrap',
        });

        expect(vi.mocked(initLocalGitRepo)).toHaveBeenCalledWith({
            cwd: tmpCustom,
            branch: 'dev',
            userEmail: 'e2e@t.com',
            userName: 'E2E',
            initialCommitMessage: 'bootstrap',
        });
        expect(vi.mocked(execGit).mock.calls).toEqual([
            ['init --bare', tmpBare],
            [`remote add origin ${tmpBare}`, tmpCustom],
            ['push -u origin dev', tmpCustom],
        ]);
    });

    it('only calls execGit and initLocalGitRepo (no config file writes)', () => {
        initBareRemoteAndCheckout({
            projectRoot: tmpProject,
            remoteDir: tmpRemote,
        });

        expect(vi.mocked(execGit)).toHaveBeenCalledTimes(3);
        expect(vi.mocked(initLocalGitRepo)).toHaveBeenCalledTimes(1);
    });

    it('throws and does not init when remoteDir is not under os.tmpdir()', () => {
        const leaked = path.join(process.cwd(), 'leaked-bare-remote');
        expect(() =>
            initBareRemoteAndCheckout({
                projectRoot: tmpProject,
                remoteDir: leaked,
            }),
        ).toThrow(/os\.tmpdir/);
        expect(vi.mocked(execGit)).not.toHaveBeenCalled();
        expect(vi.mocked(initLocalGitRepo)).not.toHaveBeenCalled();
    });

    it('throws and does not init when projectRoot is not under os.tmpdir()', () => {
        const leaked = path.join(process.cwd(), 'leaked-bare-project');
        expect(() =>
            initBareRemoteAndCheckout({
                projectRoot: leaked,
                remoteDir: tmpRemote,
            }),
        ).toThrow(/os\.tmpdir/);
        expect(vi.mocked(execGit)).not.toHaveBeenCalled();
        expect(vi.mocked(initLocalGitRepo)).not.toHaveBeenCalled();
    });
});
