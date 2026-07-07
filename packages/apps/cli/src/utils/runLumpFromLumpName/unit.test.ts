import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import * as core from '@lumpcode/core';

import { noopLogger } from '../noopLogger';

import { LUMP_BRANCH_PREFIX } from '../../consts';
import { writeMinimalLump } from '../../testing';
import { acquireWorkspacePathLock } from '../workspacePathLock';
import { runLumpFromLumpName } from './main';

vi.mock('@lumpcode/core', async () => {
    const actual = await vi.importActual<typeof core>('@lumpcode/core');
    return {
        ...actual,
        runLump: vi.fn(),
    };
});

function git(cmd: string, cwd: string) {
    execSync(`git ${cmd}`, { cwd, stdio: 'pipe' });
}

describe('runLumpFromLumpName', () => {
    let projectRoot: string;
    let remoteDir: string;
    let localConfigFolderPath: string;
    let globalConfigFolderPath: string;

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-run-from-name-'));
        remoteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-run-from-name-remote-'));
        globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-run-from-name-global-'));
        localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        await fs.mkdir(localConfigFolderPath, { recursive: true });
        await fs.writeFile(
            path.join(localConfigFolderPath, 'local.json'),
            JSON.stringify({ mode: 'dedicated', primaryBranch: 'main' }),
            'utf-8',
        );
        await fs.writeFile(
            path.join(localConfigFolderPath, 'project.json'),
            JSON.stringify({ projectName: 'run-from-name-test' }),
            'utf-8',
        );

        git('init --bare', remoteDir);
        git('init -b main', projectRoot);
        git('config user.email "test@test.com"', projectRoot);
        git('config user.name "Test"', projectRoot);
        git('commit --allow-empty -m "init"', projectRoot);
        git(`remote add origin ${remoteDir}`, projectRoot);
        git('push -u origin main', projectRoot);

        vi.mocked(core.runLump).mockReset();
    });

    afterEach(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
        await fs.rm(remoteDir, { recursive: true, force: true });
        await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
    });

    function callRunLumpFromLumpName(overrides: Partial<Parameters<typeof runLumpFromLumpName>[0]> = {}) {
        return runLumpFromLumpName({
            lumpName: 'my-lump',
            localConfigFolderPath,
            globalConfigFolderPath,
            sourceProjectRoot: projectRoot,
            logger: noopLogger,
            ...overrides,
        });
    }

    async function countLockFiles(): Promise<number> {
        const locksDir = path.join(globalConfigFolderPath, 'workspace-path-locks');
        const files = await fs.readdir(locksDir).catch(() => []);
        return files.filter((f) => f.endsWith('.lock.json')).length;
    }

    function createAndPushLumpBranch(lumpName: string, contextName: string) {
        const branch = `${LUMP_BRANCH_PREFIX}${lumpName}/${contextName}`;
        git('checkout main', projectRoot);
        git(`checkout -b ${branch}`, projectRoot);
        git('commit --allow-empty -m "lump work"', projectRoot);
        git(`push origin ${branch}`, projectRoot);
        git('checkout main', projectRoot);
    }

    it('releases the execution path lock when a dedicated lump is disabled', async () => {
        await writeMinimalLump(projectRoot, 'my-lump', { disabled: true });

        const result = await callRunLumpFromLumpName();

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.skipped).toBe(true);
        if (!result.data.skipped) throw new Error('unreachable');
        expect(result.data.reason).toBe('disabled');
        expect(await countLockFiles()).toBe(0);
        expect(core.runLump).not.toHaveBeenCalled();
    });

    it('releases the execution path lock when tooManyOpenBranches skips in phase 2', async () => {
        await writeMinimalLump(projectRoot, 'my-lump', { maximumNumberOfConcurrentBranches: 2 });
        createAndPushLumpBranch('my-lump', 'ctx-a');
        createAndPushLumpBranch('my-lump', 'ctx-b');

        const result = await callRunLumpFromLumpName();

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.skipped).toBe(true);
        if (!result.data.skipped) throw new Error('unreachable');
        expect(result.data.reason).toBe('tooManyOpenBranches');
        expect(await countLockFiles()).toBe(0);
        expect(core.runLump).not.toHaveBeenCalled();
    });

    it('returns workspacePathBusy without adopting a lock when execution path is held', async () => {
        await writeMinimalLump(projectRoot, 'my-lump');
        const held = await acquireWorkspacePathLock({
            globalConfigFolderPath,
            workspacePath: projectRoot,
            lumpName: 'holder',
            mode: 'fail',
        });
        expect(held.success).toBe(true);
        if (!held.success) throw new Error('unreachable');

        const result = await callRunLumpFromLumpName({ lockMode: 'fail' });

        expect(result.success).toBe(false);
        expect(await countLockFiles()).toBe(1);

        await held.data();
        expect(await countLockFiles()).toBe(0);
        expect(core.runLump).not.toHaveBeenCalled();
    });
});
