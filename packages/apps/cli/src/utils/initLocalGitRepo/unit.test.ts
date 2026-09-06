import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { execGit } from '../execGit';
import { initLocalGitRepo } from './main';

vi.mock('../execGit', () => ({
    execGit: vi.fn(),
}));

const tmpRepo = path.join(os.tmpdir(), 'lump-init-local-repo');
const tmpCustom = path.join(os.tmpdir(), 'lump-init-local-custom');

describe('initLocalGitRepo', () => {
    afterEach(() => {
        vi.mocked(execGit).mockClear();
    });

    it('calls execGit with default branch, identity, and empty init commit', () => {
        initLocalGitRepo({ cwd: tmpRepo });

        expect(vi.mocked(execGit).mock.calls).toEqual([
            ['init -b main', tmpRepo],
            ['config user.email "test@test.com"', tmpRepo],
            ['config user.name "Test"', tmpRepo],
            ['commit --allow-empty -m "init"', tmpRepo],
        ]);
    });

    it('honors branch, userEmail, userName, and initialCommitMessage overrides', () => {
        initLocalGitRepo({
            cwd: tmpCustom,
            branch: 'dev',
            userEmail: 'e2e@t.com',
            userName: 'E2E',
            initialCommitMessage: 'bootstrap',
        });

        expect(vi.mocked(execGit).mock.calls).toEqual([
            ['init -b dev', tmpCustom],
            ['config user.email "e2e@t.com"', tmpCustom],
            ['config user.name "E2E"', tmpCustom],
            ['commit --allow-empty -m "bootstrap"', tmpCustom],
        ]);
    });

    it('does not call remote or push subcommands', () => {
        initLocalGitRepo({ cwd: tmpRepo });

        for (const [cmd] of vi.mocked(execGit).mock.calls) {
            expect(cmd).not.toMatch(/\bremote\b/);
            expect(cmd).not.toMatch(/\bpush\b/);
        }
    });

    it('throws and does not init when cwd is not under os.tmpdir()', () => {
        const leaked = path.join(process.cwd(), 'leaked-local-git');
        expect(() => initLocalGitRepo({ cwd: leaked })).toThrow(/os\.tmpdir/);
        expect(vi.mocked(execGit)).not.toHaveBeenCalled();
    });
});
