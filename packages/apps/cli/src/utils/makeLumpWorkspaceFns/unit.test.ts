import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { execAsync, shellBestEffort, shellSingleQuote } from '@lumpcode/core';
import { makeLumpWorkspaceFns } from './main';
import { lumpWorktreePath } from '../getLumpWorktreePath';

function git(cmd: string, cwd: string) {
    execSync(`git ${cmd}`, { cwd, stdio: 'pipe' });
}

describe('makeLumpWorkspaceFns', () => {
    const executionWorkspacePath = '/wk';

    describe('checkout strategy', () => {
        it('setup returns branch workspace equal to execution workspace and prefixes commands with cd', async () => {
            const { setupWorkspaceFn } = makeLumpWorkspaceFns({
                executionWorkspacePath,
                projectBaseBranch: 'main',
                workspaceStrategy: 'checkout',
            });
            const out = await setupWorkspaceFn({
                baseBranch: 'feature/x',
                branchName: 'lump/foo/ctx',
                contextList: [{ name: 'ctx', variables: {} }],
            });
            expect(out.workspacePath).toBe(path.resolve(executionWorkspacePath));
            expect(out.command).toMatch(/^cd '/);
            expect(out.command).toContain(`cd '${executionWorkspacePath}'`);
            expect(out.command).toContain('git fetch origin feature/x');
            expect(out.command).toContain('git switch feature/x');
            expect(out.command).toContain('git reset --hard origin/feature/x');
            expect(out.command).toContain('git pull origin feature/x');
            expect(out.command).toContain(shellBestEffort(`git branch -D ${shellSingleQuote('lump/foo/ctx')}`));
            expect(out.command).toContain(`git switch -c ${shellSingleQuote('lump/foo/ctx')}`);
        });

        it('teardown switches back to projectBaseBranch via cd to execution workspace', async () => {
            const { teardownWorkspaceFn } = makeLumpWorkspaceFns({
                executionWorkspacePath,
                projectBaseBranch: 'main',
                workspaceStrategy: 'checkout',
            });
            const cmd = await teardownWorkspaceFn({
                baseBranch: 'feature/x',
                branchName: 'lump/foo/ctx',
                contextList: [{ name: 'ctx', variables: {} }],
                workspacePath: executionWorkspacePath,
            });
            expect(cmd).toContain(`cd '${executionWorkspacePath}'`);
            expect(cmd).toContain('git switch main');
        });
    });

    describe('worktree strategy', () => {
        it('setup returns nested branch workspace path mirroring branch segments', async () => {
            const { setupWorkspaceFn } = makeLumpWorkspaceFns({
                executionWorkspacePath,
                projectBaseBranch: 'main',
                workspaceStrategy: 'worktree',
            });
            const branchName = 'lump/foo/ctx';
            const out = await setupWorkspaceFn({
                baseBranch: 'main',
                branchName,
                contextList: [{ name: 'ctx', variables: {} }],
            });
            const expectedBranchWorkspace = lumpWorktreePath({
                executionWorkspacePath: path.resolve(executionWorkspacePath),
                branchName,
            });
            expect(out.workspacePath).toBe(expectedBranchWorkspace);
            expect(out.command).toMatch(/^cd '/);
            expect(out.command).toContain(`cd '${executionWorkspacePath}'`);
            expect(out.command).toContain(`worktree add -B ${shellSingleQuote(branchName)}`);
            expect(out.command).toContain(shellSingleQuote('origin/main'));
            if (process.platform === 'win32') {
                expect(out.command).toContain('if exist');
                expect(out.command).toContain('rmdir /s /q');
            } else {
                expect(out.command).toContain('rm -rf');
            }
            expect(out.command).toContain(`'${expectedBranchWorkspace}'`);
            expect(out.command).not.toContain('git push --delete');
            expect(out.command).not.toContain('git -C');
        });

        it('teardown removes worktree via cd to execution workspace', async () => {
            const { teardownWorkspaceFn } = makeLumpWorkspaceFns({
                executionWorkspacePath,
                projectBaseBranch: 'main',
                workspaceStrategy: 'worktree',
            });
            const branchName = 'lump/foo/ctx';
            const branchWorkspacePath = lumpWorktreePath({
                executionWorkspacePath: path.resolve(executionWorkspacePath),
                branchName,
            });
            const cmd = await teardownWorkspaceFn({
                baseBranch: 'main',
                branchName,
                contextList: [{ name: 'ctx', variables: {} }],
                workspacePath: branchWorkspacePath,
            });
            expect(cmd).toContain(`cd '${executionWorkspacePath}'`);
            expect(cmd).toContain('worktree remove --force');
            expect(cmd).toContain(`'${branchWorkspacePath}'`);
            expect(cmd).not.toContain('git -C');
        });
    });

    describe('git repo integration', () => {
        let gitExecutionWorkspacePath: string;
        let remoteDir: string;

        beforeEach(async () => {
            gitExecutionWorkspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-wt-int-'));
            remoteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-wt-int-remote-'));

            git('init --bare', remoteDir);
            git('init -b main', gitExecutionWorkspacePath);
            git('config user.email "test@test.com"', gitExecutionWorkspacePath);
            git('config user.name "Test"', gitExecutionWorkspacePath);
            git('commit --allow-empty -m "init"', gitExecutionWorkspacePath);
            git(`remote add origin ${remoteDir}`, gitExecutionWorkspacePath);
            git('push -u origin main', gitExecutionWorkspacePath);
        });

        afterEach(async () => {
            await fs.rm(gitExecutionWorkspacePath, { recursive: true, force: true });
            await fs.rm(remoteDir, { recursive: true, force: true });
        });

        it('checkout strategy creates lump branch in execution workspace when setup runs from a different cwd', async () => {
            const { setupWorkspaceFn } = makeLumpWorkspaceFns({
                executionWorkspacePath: gitExecutionWorkspacePath,
                projectBaseBranch: 'main',
                workspaceStrategy: 'checkout',
            });
            const setupOut = await setupWorkspaceFn({
                baseBranch: 'main',
                branchName: 'lump/test/ctx',
                contextList: [{ name: 'ctx', variables: {} }],
            });

            const outerCwd = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-wt-outer-'));
            try {
                const result = await execAsync(setupOut.command, { cwd: outerCwd });
                expect(result.success).toBe(true);
            } finally {
                await fs.rm(outerCwd, { recursive: true, force: true });
            }

            const branchList = execSync('git branch --list lump/test/ctx', {
                cwd: gitExecutionWorkspacePath,
                encoding: 'utf-8',
            });
            expect(branchList).toContain('lump/test/ctx');
        });

        it('worktree strategy creates linked worktree and teardown removes it', async () => {
            const branchName = 'lump/test/ctx';
            const { setupWorkspaceFn, teardownWorkspaceFn } = makeLumpWorkspaceFns({
                executionWorkspacePath: gitExecutionWorkspacePath,
                projectBaseBranch: 'main',
                workspaceStrategy: 'worktree',
            });

            const setupOut = await setupWorkspaceFn({
                baseBranch: 'main',
                branchName,
                contextList: [{ name: 'ctx', variables: {} }],
            });
            const branchWorkspacePath = setupOut.workspacePath;

            const outerCwd = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-wt-outer-'));
            try {
                const setupResult = await execAsync(setupOut.command, { cwd: outerCwd });
                expect(setupResult.success).toBe(true);

                const wtPath = lumpWorktreePath({ executionWorkspacePath: gitExecutionWorkspacePath, branchName });
                await expect(fs.access(wtPath)).resolves.toBeUndefined();

                const teardownCmd = await teardownWorkspaceFn({
                    baseBranch: 'main',
                    branchName,
                    contextList: [{ name: 'ctx', variables: {} }],
                    workspacePath: branchWorkspacePath,
                });
                const teardownResult = await execAsync(teardownCmd, { cwd: branchWorkspacePath });
                expect(teardownResult.success).toBe(true);

                await expect(fs.access(wtPath)).rejects.toThrow();
            } finally {
                await fs.rm(outerCwd, { recursive: true, force: true });
            }
        });

        it('worktree setup recreates after stale worktree directory is left behind', async () => {
            const branchName = 'lump/test/stale';
            const branchWorkspacePath = lumpWorktreePath({
                executionWorkspacePath: gitExecutionWorkspacePath,
                branchName,
            });
            await fs.mkdir(branchWorkspacePath, { recursive: true });
            await fs.writeFile(path.join(branchWorkspacePath, 'stale.txt'), 'leftover', 'utf-8');

            const { setupWorkspaceFn } = makeLumpWorkspaceFns({
                executionWorkspacePath: gitExecutionWorkspacePath,
                projectBaseBranch: 'main',
                workspaceStrategy: 'worktree',
            });
            const setupOut = await setupWorkspaceFn({
                baseBranch: 'main',
                branchName,
                contextList: [{ name: 'ctx', variables: {} }],
            });

            const result = await execAsync(setupOut.command, { cwd: gitExecutionWorkspacePath });
            expect(result.success).toBe(true);
            await expect(fs.access(branchWorkspacePath)).resolves.toBeUndefined();
        });

        it('worktree branch workspace can commit and push a marker file to the bare remote', async () => {
            const branchName = 'lump/wtLump/README';
            const markerRelPath = '.lumpcode/e2e-markers/wtLump/README.done';
            const { setupWorkspaceFn } = makeLumpWorkspaceFns({
                executionWorkspacePath: gitExecutionWorkspacePath,
                projectBaseBranch: 'main',
                workspaceStrategy: 'worktree',
            });
            const setupOut = await setupWorkspaceFn({
                baseBranch: 'main',
                branchName,
                contextList: [{ name: 'README', variables: {} }],
            });
            const branchWorkspacePath = setupOut.workspacePath;

            const setupResult = await execAsync(setupOut.command, { cwd: gitExecutionWorkspacePath });
            expect(setupResult.success).toBe(true);

            const markerDir = path.dirname(path.join(branchWorkspacePath, markerRelPath));
            await fs.mkdir(markerDir, { recursive: true });
            await fs.writeFile(path.join(branchWorkspacePath, markerRelPath), '', 'utf-8');

            expect((await execAsync('git add .', { cwd: branchWorkspacePath })).success).toBe(true);
            expect((await execAsync('git commit -m "LUMP:README"', { cwd: branchWorkspacePath })).success).toBe(true);
            expect(
                (await execAsync(`git push origin ${shellSingleQuote(branchName)}`, { cwd: branchWorkspacePath })).success,
            ).toBe(true);

            expect(() => git(`show ${branchName}:${markerRelPath}`, remoteDir)).not.toThrow();
        });
    });
});
