import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { execGit } from './main';

describe('execGit', () => {
    it('returns trimmed stdout for a successful git command', async () => {
        const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'exec-git-'));
        execGit('init -b main', cwd);
        execGit('config user.email "test@test.com"', cwd);
        execGit('config user.name "Test"', cwd);
        execGit('commit --allow-empty -m "init"', cwd);

        expect(execGit('rev-parse --abbrev-ref HEAD', cwd)).toBe('main');
        expect(execGit('log -1 --format=%s', cwd)).toBe('init');
    });

    it('throws when the git command fails', async () => {
        const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'exec-git-fail-'));
        expect(() => execGit('rev-parse HEAD', cwd)).toThrow();
    });
});
