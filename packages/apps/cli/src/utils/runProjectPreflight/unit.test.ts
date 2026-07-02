import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LOCAL_CONFIG_FILE_NAME } from '../readLocalConfig';
import { runProjectPreflight } from './main';
import { createIntegrationBranch, gitCurrentBranch, initBareRemoteAndCheckout, writeLocalJson } from '../../testing';

describe('runProjectPreflight', () => {
    let projectRoot: string;
    let remoteDir: string;
    let globalConfigFolderPath: string;
    let localConfigFolderPath: string;

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-run-project-preflight-'));
        remoteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-run-project-preflight-remote-'));
        globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-run-project-preflight-global-'));
        localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        initBareRemoteAndCheckout(projectRoot, remoteDir);
        await fs.mkdir(localConfigFolderPath, { recursive: true });
        await fs.writeFile(
            path.join(localConfigFolderPath, 'project.json'),
            JSON.stringify({ projectName: 'run-project-preflight' }),
            'utf-8',
        );
    });

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
        await fs.rm(remoteDir, { recursive: true, force: true });
        await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
    });

    async function writeLocalJsonDedicated(primaryBranch = 'main') {
        await writeLocalJson(localConfigFolderPath, { mode: 'dedicated', primaryBranch });
    }

    it('hard-fails when local.json is missing', async () => {
        const result = await runProjectPreflight({
            sourceProjectRoot: projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toContain('Missing .lumpcode/local.json');
    });

    it('returns the resolved workspace + primary branch + mode in dedicated mode', async () => {
        await writeLocalJsonDedicated();
        const result = await runProjectPreflight({
            sourceProjectRoot: projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.mode).toBe('dedicated');
        expect(result.data.projectBaseBranch).toBe('main');
        expect(result.data.executionWorkspacePath).toBe(projectRoot);
        expect(result.data.workspaceStrategy).toBe('checkout');
    });

    it('returns the project copy as executionWorkspacePath in shared mode', async () => {
        await writeLocalJson(localConfigFolderPath, { mode: 'shared', primaryBranch: 'main' });
        const result = await runProjectPreflight({
            sourceProjectRoot: projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.executionWorkspacePath).toBe(
            path.resolve(path.join(globalConfigFolderPath, 'project-copies', 'run-project-preflight')),
        );
    });

    it('uses frozen localConfig instead of re-reading local.json from disk', async () => {
        await writeLocalJsonDedicated();
        await fs.writeFile(
            path.join(localConfigFolderPath, LOCAL_CONFIG_FILE_NAME),
            JSON.stringify({
                mode: 'dedicated',
                primaryBranch: 'main',
                workspaceStrategy: 'worktree',
            }),
            'utf-8',
        );

        const result = await runProjectPreflight({
            sourceProjectRoot: projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            localConfig: {
                mode: 'dedicated',
                primaryBranch: 'main',
                workspaceStrategy: 'checkout',
            },
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.workspaceStrategy).toBe('checkout');
    });

    it('defaults to primary branch when targetBranch is omitted', async () => {
        await writeLocalJson(localConfigFolderPath, {
            mode: 'dedicated',
            primaryBranches: ['main', 'ver/0.0.9'],
        });
        git('checkout -b ver/0.0.9', projectRoot);
        git('commit --allow-empty -m "ver"', projectRoot);
        git('push -u origin ver/0.0.9', projectRoot);
        git('checkout main', projectRoot);

        const result = await runProjectPreflight({
            sourceProjectRoot: projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(gitCurrentBranch(result.data.executionWorkspacePath)).toBe('main');
    });

    it('pre-flights to targetBranch ver/0.0.9 when specified', async () => {
        await writeLocalJson(localConfigFolderPath, {
            mode: 'dedicated',
            primaryBranch: 'main',
            primaryBranches: ['main', 'ver/0.0.9'],
        });
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: 'ver/0.0.9',
            extraFiles: { 'RELEASE_ONLY.txt': 'release\n' },
        });

        const result = await runProjectPreflight({
            sourceProjectRoot: projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            targetBranch: 'ver/0.0.9',
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(gitCurrentBranch(result.data.executionWorkspacePath)).toBe('ver/0.0.9');
        expect(result.data.projectBaseBranch).toBe('ver/0.0.9');
    });

    it('fails when targetBranch is missing on origin', async () => {
        await writeLocalJsonDedicated();
        const result = await runProjectPreflight({
            sourceProjectRoot: projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            targetBranch: 'ver/0.0.9',
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toMatch(/ver\/0\.0\.9/i);
    });

    it('shared mode + targetBranch leaves source checkout untouched and syncs copy', async () => {
        await writeLocalJson(localConfigFolderPath, {
            mode: 'shared',
            primaryBranch: 'main',
            primaryBranches: ['main', 'ver/0.0.9'],
        });
        await createIntegrationBranch({
            projectRoot,
            remoteDir,
            branchName: 'ver/0.0.9',
        });

        const result = await runProjectPreflight({
            sourceProjectRoot: projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            targetBranch: 'ver/0.0.9',
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(gitCurrentBranch(projectRoot)).toBe('main');
        expect(gitCurrentBranch(result.data.executionWorkspacePath)).toBe('ver/0.0.9');
        expect(result.data.executionWorkspacePath).toBe(
            path.resolve(path.join(globalConfigFolderPath, 'project-copies', 'run-project-preflight')),
        );
    });

});

function git(cmd: string, cwd: string) {
    execSync(`git ${cmd}`, { cwd, stdio: 'pipe' });
}
