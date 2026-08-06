import { afterEach, describe, expect, it, vi } from 'vitest';

import { execGit } from '../execGit';
import { initLocalGitRepo } from './main';

vi.mock('../execGit', () => ({
    execGit: vi.fn(),
}));

describe('initLocalGitRepo', () => {
    afterEach(() => {
        vi.mocked(execGit).mockClear();
    });

    it('calls execGit with default branch, identity, and empty init commit', () => {
        initLocalGitRepo({ cwd: '/tmp/repo' });

        expect(vi.mocked(execGit).mock.calls).toEqual([
            ['init -b main', '/tmp/repo'],
            ['config user.email "test@test.com"', '/tmp/repo'],
            ['config user.name "Test"', '/tmp/repo'],
            ['commit --allow-empty -m "init"', '/tmp/repo'],
        ]);
    });

    it('honors branch, userEmail, userName, and initialCommitMessage overrides', () => {
        initLocalGitRepo({
            cwd: '/tmp/custom',
            branch: 'dev',
            userEmail: 'e2e@t.com',
            userName: 'E2E',
            initialCommitMessage: 'bootstrap',
        });

        expect(vi.mocked(execGit).mock.calls).toEqual([
            ['init -b dev', '/tmp/custom'],
            ['config user.email "e2e@t.com"', '/tmp/custom'],
            ['config user.name "E2E"', '/tmp/custom'],
            ['commit --allow-empty -m "bootstrap"', '/tmp/custom'],
        ]);
    });

    it('does not call remote or push subcommands', () => {
        initLocalGitRepo({ cwd: '/tmp/repo' });

        for (const [cmd] of vi.mocked(execGit).mock.calls) {
            expect(cmd).not.toMatch(/\bremote\b/);
            expect(cmd).not.toMatch(/\bpush\b/);
        }
    });
});
