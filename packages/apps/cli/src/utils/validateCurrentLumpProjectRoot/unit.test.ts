import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { shellSingleQuote } from '@lumpcode/core';

import { createTempTestDirs, removeTempTestDirs } from '../createTempTestDirs';
import { execGit } from '../execGit';
import { initLocalGitRepo } from '../initLocalGitRepo';
import { validateCurrentLumpProjectRoot } from './main';

describe('validateCurrentLumpProjectRoot', () => {
    let projectRoot: string;
    let localConfigFolderPath: string;

    beforeEach(async () => {
        ({ projectRoot, localConfigFolderPath } = await createTempTestDirs({
            prefix: 'lump-project-root-',
            remote: false,
            global: false,
        }));
    });

    afterEach(async () => {
        await removeTempTestDirs({ projectRoot });
    });

    it('succeeds when .lumpcode exists and .git is a directory', async () => {
        initLocalGitRepo({ cwd: projectRoot });

        const result = await validateCurrentLumpProjectRoot({ cwd: projectRoot });
        expect(result.success).toBe(true);
    });

    it('succeeds when cwd is a second linked worktree (.git is a file)', async () => {
        initLocalGitRepo({ cwd: projectRoot });
        const worktreeParent = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-project-root-wt-'));
        const worktreePath = path.join(worktreeParent, 'wt');
        try {
            execGit(`worktree add -b second-wt ${shellSingleQuote(worktreePath)}`, projectRoot);
            await fs.mkdir(path.join(worktreePath, '.lumpcode'), { recursive: true });

            const gitStat = await fs.stat(path.join(worktreePath, '.git'));
            expect(gitStat.isFile()).toBe(true);
            expect(await fs.readFile(path.join(worktreePath, '.git'), 'utf-8')).toMatch(/^gitdir:/);

            const result = await validateCurrentLumpProjectRoot({ cwd: worktreePath });
            expect(result.success).toBe(true);
        } finally {
            try {
                execGit(`worktree remove --force ${shellSingleQuote(worktreePath)}`, projectRoot);
            } catch {
                // afterEach still removes the primary checkout
            }
            await fs.rm(worktreeParent, { recursive: true, force: true });
        }
    });

    it('fails when .lumpcode is missing', async () => {
        initLocalGitRepo({ cwd: projectRoot });
        await fs.rm(localConfigFolderPath, { recursive: true, force: true });

        const result = await validateCurrentLumpProjectRoot({ cwd: projectRoot });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toContain('missing .lumpcode directory');
    });

    it('fails when git rev-parse --git-dir fails', async () => {
        const result = await validateCurrentLumpProjectRoot({ cwd: projectRoot });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toContain('git rev-parse --git-dir failed');
    });
});
