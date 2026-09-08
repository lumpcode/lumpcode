import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runPreflight } from './main';
import { execGit } from '../execGit';
import { initBareRemoteAndCheckout } from '../initBareRemoteAndCheckout';
import { createTempTestDirs, removeTempTestDirs } from '../createTempTestDirs';

describe('runPreflight', () => {
    let projectRoot: string;
    let remoteDir: string;
    let globalConfigFolderPath: string;

    beforeEach(async () => {
        ({ projectRoot, remoteDir, globalConfigFolderPath } = await createTempTestDirs({ prefix: 'lump-preflight-' }));
        initBareRemoteAndCheckout({ projectRoot, remoteDir });
    });

    afterEach(async () => {
        await removeTempTestDirs({ projectRoot, remoteDir, globalConfigFolderPath });
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
            execGit('add README.md', projectRoot);
            execGit('commit -m "add readme"', projectRoot);
            execGit('push origin main', projectRoot);

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

    describe.skip('shared-in-place-run', () => {
        it('does not create a project-copies directory in shared mode', async () => {
            const projectName = 'preflight-shared-in-place';
            const copyPath = path.join(globalConfigFolderPath, 'project-copies', projectName);

            const result = await runPreflight({
                mode: 'shared',
                projectBaseBranch: 'main',
                sourceProjectRoot: projectRoot,
                globalConfigFolderPath,
                projectName,
            });

            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');
            expect(path.resolve(result.data.executionWorkspacePath)).toBe(path.resolve(projectRoot));
            await expect(fs.access(copyPath)).rejects.toMatchObject({ code: 'ENOENT' });
            await expect(fs.access(path.join(globalConfigFolderPath, 'project-copies'))).rejects.toMatchObject({
                code: 'ENOENT',
            });
        });

        it('still hard-resets the dedicated checkout', async () => {
            const filePath = path.join(projectRoot, 'README.md');
            await fs.writeFile(filePath, '# initial\n', 'utf-8');
            execGit('add README.md', projectRoot);
            execGit('commit -m "add readme"', projectRoot);
            execGit('push origin main', projectRoot);
            await fs.writeFile(filePath, '# dirty\n', 'utf-8');

            const result = await runPreflight({
                mode: 'dedicated',
                projectBaseBranch: 'main',
                sourceProjectRoot: projectRoot,
                globalConfigFolderPath,
                projectName: 'irrelevant',
            });
            expect(result.success).toBe(true);
            expect(await fs.readFile(filePath, 'utf-8')).toBe('# initial\n');
        });
    });
});
