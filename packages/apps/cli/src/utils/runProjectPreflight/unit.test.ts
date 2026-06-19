import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LOCAL_CONFIG_FILE_NAME } from '../readLocalConfig';
import { runProjectPreflight } from './main';

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
        initRepoWithRemote(projectRoot, remoteDir);
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

    async function writeLocalJson(mode: 'shared' | 'dedicated', projectBaseBranch = 'main') {
        await fs.writeFile(
            path.join(localConfigFolderPath, LOCAL_CONFIG_FILE_NAME),
            JSON.stringify({ mode, projectBaseBranch }),
            'utf-8',
        );
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

    it('returns the resolved workspace + projectBaseBranch + mode in dedicated mode', async () => {
        await writeLocalJson('dedicated');
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
        await writeLocalJson('shared');
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
        await writeLocalJson('dedicated');
        await fs.writeFile(
            path.join(localConfigFolderPath, LOCAL_CONFIG_FILE_NAME),
            JSON.stringify({
                mode: 'dedicated',
                projectBaseBranch: 'main',
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
                projectBaseBranch: 'main',
                workspaceStrategy: 'checkout',
            },
        });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.workspaceStrategy).toBe('checkout');
    });

});
