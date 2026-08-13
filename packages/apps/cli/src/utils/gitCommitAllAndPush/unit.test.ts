import { afterEach, describe, expect, it, vi } from 'vitest';

import { execGit } from '../execGit';
import { gitCommitAllAndPush, gitCommitOrAllowEmpty } from './main';

vi.mock('../execGit', () => ({
    execGit: vi.fn(),
}));

describe('gitCommitOrAllowEmpty', () => {
    afterEach(() => {
        vi.mocked(execGit).mockReset();
    });

    it('calls commit -m when the first commit succeeds', () => {
        gitCommitOrAllowEmpty({ cwd: '/tmp/repo', message: 'msg' });

        expect(vi.mocked(execGit).mock.calls).toEqual([['commit -m "msg"', '/tmp/repo']]);
    });

    it('falls back to commit --allow-empty when the first commit throws', () => {
        vi.mocked(execGit).mockImplementationOnce(() => {
            throw new Error('nothing to commit');
        });

        gitCommitOrAllowEmpty({ cwd: '/tmp/repo', message: 'empty ok' });

        expect(vi.mocked(execGit).mock.calls).toEqual([
            ['commit -m "empty ok"', '/tmp/repo'],
            ['commit --allow-empty -m "empty ok"', '/tmp/repo'],
        ]);
    });

    it('propagates errors from the allow-empty commit', () => {
        vi.mocked(execGit)
            .mockImplementationOnce(() => {
                throw new Error('nothing to commit');
            })
            .mockImplementationOnce(() => {
                throw new Error('fatal');
            });

        expect(() => gitCommitOrAllowEmpty({ cwd: '/tmp/repo', message: 'fail' })).toThrow('fatal');
    });
});

describe('gitCommitAllAndPush', () => {
    afterEach(() => {
        vi.mocked(execGit).mockReset();
    });

    it('stages all, commits, and pushes origin main by default', () => {
        gitCommitAllAndPush({ cwd: '/tmp/repo', message: 'work' });

        expect(vi.mocked(execGit).mock.calls).toEqual([
            ['add -A', '/tmp/repo'],
            ['commit -m "work"', '/tmp/repo'],
            ['push origin main', '/tmp/repo'],
        ]);
    });

    it('honors stageAll: false, branch, and setUpstream', () => {
        gitCommitAllAndPush({
            cwd: '/tmp/repo',
            message: 'feat',
            stageAll: false,
            branch: 'dev',
            setUpstream: true,
        });

        expect(vi.mocked(execGit).mock.calls).toEqual([
            ['commit -m "feat"', '/tmp/repo'],
            ['push -u origin dev', '/tmp/repo'],
        ]);
    });

    it('uses allow-empty commit fallback before push', () => {
        vi.mocked(execGit).mockImplementation((cmd: string) => {
            if (cmd.startsWith('commit -m ') && !cmd.includes('--allow-empty')) {
                throw new Error('nothing to commit');
            }
            return '';
        });

        gitCommitAllAndPush({ cwd: '/tmp/repo', message: 'empty' });

        expect(vi.mocked(execGit).mock.calls).toEqual([
            ['add -A', '/tmp/repo'],
            ['commit -m "empty"', '/tmp/repo'],
            ['commit --allow-empty -m "empty"', '/tmp/repo'],
            ['push origin main', '/tmp/repo'],
        ]);
    });
});
