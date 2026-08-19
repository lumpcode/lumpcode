import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { makeGatedGitFns } from './main';

function initTestGitRepo(projectRoot: string) {
    execSync(
        'git init && git config user.email "test@test.com" && git config user.name "Test" && git commit --allow-empty -m "init"',
        { cwd: projectRoot, stdio: 'pipe' },
    );
}

describe('makeGatedGitFns', () => {
    let globalConfigFolderPath: string;
    let projectRoot: string;

    beforeEach(async () => {
        globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'gated-git-global-'));
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gated-git-repo-'));
        initTestGitRepo(projectRoot);
    });

    afterEach(async () => {
        await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
        await fs.rm(projectRoot, { recursive: true, force: true });
    });

    it('runs locked add then commit and returns success(undefined)', async () => {
        const { gitAddCommitFn } = makeGatedGitFns({
            gitLock: {
                globalConfigFolderPath,
                gitCwd: projectRoot,
                lumpName: 'test-lump',
                lockMode: 'fail',
            },
        });

        const result = await gitAddCommitFn({
            baseBranch: 'main',
            branchName: 'lump/test/ctx',
            workspacePath: projectRoot,
            context: { name: 'ctx', variables: {} },
            commitMessage: 'LUMP:ctx',
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data).toBeUndefined();

        const log = execSync('git log -1 --pretty=%s', { cwd: projectRoot, encoding: 'utf8' }).trim();
        expect(log).toBe('LUMP:ctx');
    });

    it('returns failure (no throw) when commit cannot run', async () => {
        const { gitAddCommitFn } = makeGatedGitFns({
            gitLock: {
                globalConfigFolderPath,
                gitCwd: projectRoot,
                lumpName: 'test-lump',
                lockMode: 'fail',
            },
        });

        // Invalid workspace forces exec failure inside the lock.
        const result = await gitAddCommitFn({
            baseBranch: 'main',
            branchName: 'lump/test/ctx',
            workspacePath: path.join(projectRoot, 'missing-dir'),
            context: { name: 'ctx', variables: {} },
            commitMessage: 'LUMP:ctx',
        });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(typeof result.data).toBe('string');
        expect(result.data.length).toBeGreaterThan(0);
    });
});
