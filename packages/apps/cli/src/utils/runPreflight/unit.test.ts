import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runPreflight } from './main';

function git(cmd: string, cwd: string) {
    execSync(`git ${cmd}`, { cwd, stdio: 'pipe' });
}

function initRepoWithRemote(projectRoot: string, remoteDir: string) {
    git('init --bare', remoteDir);
    git('init -b main', projectRoot);
    git('config user.email "test@test.com"', projectRoot);
    git('config user.name "Test"', projectRoot);
    git('commit --allow-empty -m "init"', projectRoot);
    git(`remote add origin ${remoteDir}`, projectRoot);
    git('push -u origin main', projectRoot);
}

describe('runPreflight', () => {
    let projectRoot: string;
    let remoteDir: string;
    let globalConfigFolderPath: string;

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-preflight-'));
        remoteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-preflight-remote-'));
        globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-preflight-global-'));
        initRepoWithRemote(projectRoot, remoteDir);
    });

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
        await fs.rm(remoteDir, { recursive: true, force: true });
        await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
    });

    describe('dedicated mode', () => {
        it('pulls projectBaseBranch in place and returns sourceProjectRoot as executionWorkspacePath', async () => {
            const result = await runPreflight({
                mode: 'dedicated',
                projectBaseBranch: 'main',
                sourceProjectRoot: projectRoot,
                globalConfigFolderPath,
                projectName: 'irrelevant',
            });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(result.data.executionWorkspacePath).toBe(projectRoot);
        });

        it('discards uncommitted local changes via git reset --hard', async () => {
            const filePath = path.join(projectRoot, 'README.md');
            await fs.writeFile(filePath, '# initial\n', 'utf-8');
            git('add README.md', projectRoot);
            git('commit -m "add readme"', projectRoot);
            git('push origin main', projectRoot);

            await fs.writeFile(filePath, '# dirty\n', 'utf-8');
            const before = await fs.readFile(filePath, 'utf-8');
            expect(before).toBe('# dirty\n');

            const result = await runPreflight({
                mode: 'dedicated',
                projectBaseBranch: 'main',
                sourceProjectRoot: projectRoot,
                globalConfigFolderPath,
                projectName: 'irrelevant',
            });
            expect(result.success).toBe(true);
            const after = await fs.readFile(filePath, 'utf-8');
            expect(after).toBe('# initial\n');
        });

        it('fails when projectBaseBranch is not on origin', async () => {
            const result = await runPreflight({
                mode: 'dedicated',
                projectBaseBranch: 'nonexistent',
                sourceProjectRoot: projectRoot,
                globalConfigFolderPath,
                projectName: 'irrelevant',
            });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data).toContain('Pre-flight failed');
        });
    });

    describe('shared mode', () => {
        it('creates the project copy on first run and returns it as executionWorkspacePath', async () => {
            const projectName = 'preflight-shared';
            const expectedCopy = path.join(globalConfigFolderPath, 'project-copies', projectName);
            await expect(fs.access(expectedCopy)).rejects.toBeDefined();

            const result = await runPreflight({
                mode: 'shared',
                projectBaseBranch: 'main',
                sourceProjectRoot: projectRoot,
                globalConfigFolderPath,
                projectName,
            });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(path.resolve(result.data.executionWorkspacePath)).toBe(path.resolve(expectedCopy));
            await fs.access(path.join(expectedCopy, '.git'));
        });

        it('reuses an existing project copy', async () => {
            const projectName = 'preflight-shared-reuse';
            const copyPath = path.join(globalConfigFolderPath, 'project-copies', projectName);

            const first = await runPreflight({
                mode: 'shared',
                projectBaseBranch: 'main',
                sourceProjectRoot: projectRoot,
                globalConfigFolderPath,
                projectName,
            });
            expect(first.success).toBe(true);

            await fs.writeFile(path.join(copyPath, 'COPY_MARKER.txt'), 'preserved', 'utf-8');

            const second = await runPreflight({
                mode: 'shared',
                projectBaseBranch: 'main',
                sourceProjectRoot: projectRoot,
                globalConfigFolderPath,
                projectName,
            });
            expect(second.success).toBe(true);
            const marker = await fs.readFile(path.join(copyPath, 'COPY_MARKER.txt'), 'utf-8');
            expect(marker).toBe('preserved');
        });

        it('never touches the source clone', async () => {
            const sourceMarker = path.join(projectRoot, 'UNCOMMITTED.txt');
            await fs.writeFile(sourceMarker, 'still here\n', 'utf-8');

            const result = await runPreflight({
                mode: 'shared',
                projectBaseBranch: 'main',
                sourceProjectRoot: projectRoot,
                globalConfigFolderPath,
                projectName: 'preflight-untouched',
            });
            expect(result.success).toBe(true);
            const after = await fs.readFile(sourceMarker, 'utf-8');
            expect(after).toBe('still here\n');
        });

        it('syncs project copy origin URL when source remote changes', async () => {
            const projectName = 'preflight-origin-sync';
            const copyPath = path.join(globalConfigFolderPath, 'project-copies', projectName);
            const remoteDirB = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-preflight-remote-b-'));

            try {
                const first = await runPreflight({
                    mode: 'shared',
                    projectBaseBranch: 'main',
                    sourceProjectRoot: projectRoot,
                    globalConfigFolderPath,
                    projectName,
                });
                expect(first.success).toBe(true);
                if (!first.success) throw new Error('unreachable');

                expect(execSync('git remote get-url origin', { cwd: copyPath, encoding: 'utf-8' }).trim()).toBe(
                    remoteDir,
                );

                git('init --bare', remoteDirB);
                git(`remote set-url origin ${remoteDirB}`, projectRoot);
                git('push -u origin main', projectRoot);
                git('branch release/2.0', projectRoot);
                git('push -u origin release/2.0', projectRoot);

                const second = await runPreflight({
                    mode: 'shared',
                    projectBaseBranch: 'main',
                    sourceProjectRoot: projectRoot,
                    globalConfigFolderPath,
                    projectName,
                });
                expect(second.success).toBe(true);
                if (!second.success) throw new Error('unreachable');

                expect(execSync('git remote get-url origin', { cwd: copyPath, encoding: 'utf-8' }).trim()).toBe(
                    remoteDirB,
                );

                git('fetch origin release/2.0', copyPath);
                expect(
                    execSync('git rev-parse --verify origin/release/2.0', { cwd: copyPath, encoding: 'utf-8' }).trim(),
                ).toMatch(/^[0-9a-f]{40}$/);
            } finally {
                await fs.rm(remoteDirB, { recursive: true, force: true });
            }
        });
    });
});
