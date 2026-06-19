import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import * as core from '@lumpcode/core';

import { acquireBranchWorkspaceLock, isBranchWorkspaceBusyError } from '../branchWorkspaceLock';
import { runLumpFromJsConfig } from './main';
import { LUMP_BRANCH_PREFIX } from '../../consts';
import type { LumpJsConfig } from '../../types';

function git(cmd: string, cwd: string) {
    execSync(`git ${cmd}`, { cwd, stdio: 'pipe' });
}

vi.mock('@lumpcode/core', async () => {
    const actual = await vi.importActual<typeof core>('@lumpcode/core');
    return {
        ...actual,
        runLump: vi.fn(),
    };
});

describe('runLumpFromJsConfig', () => {
    let projectRoot: string;
    let remoteDir: string;
    let localConfigFolderPath: string;
    let globalConfigFolderPath: string;

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-run-from-js-'));
        remoteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-run-from-js-remote-'));
        globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-run-from-js-global-'));
        localConfigFolderPath = path.join(projectRoot, '.lumpcode');
        await fs.mkdir(localConfigFolderPath, { recursive: true });

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

    function makeJsConfig(overrides: Partial<LumpJsConfig> = {}): LumpJsConfig {
        return {
            projectRoot,
            getContextListFn: () => [{ name: 'ctx1', variables: {} }],
            prompt: {
                promptFn: () => 'do thing',
                commandFn: () => ({ executable: 'echo', args: ['hi'] }),
            },
            ...overrides,
        } as LumpJsConfig;
    }

    function callRunLumpFromJsConfig(jsConfig: LumpJsConfig) {
        return runLumpFromJsConfig({
            jsConfig,
            lumpName: 'my-lump',
            localConfigFolderPath,
            globalConfigFolderPath,
            projectBaseBranch: 'main',
            executionWorkspacePath: projectRoot,
            workspaceStrategy: 'checkout',
            logger: core.noopLogger,
        });
    }

    function createAndPushLumpBranch(lumpName: string, contextName: string) {
        const branch = `${LUMP_BRANCH_PREFIX}${lumpName}/${contextName}`;
        git('checkout main', projectRoot);
        git(`checkout -b ${branch}`, projectRoot);
        git(`commit --allow-empty -m "lump work"`, projectRoot);
        git(`push origin ${branch}`, projectRoot);
        git('checkout main', projectRoot);
    }

    function createLocalOnlyLumpBranch(lumpName: string, contextName: string) {
        const branch = `${LUMP_BRANCH_PREFIX}${lumpName}/${contextName}`;
        git('checkout main', projectRoot);
        git(`checkout -b ${branch}`, projectRoot);
        git(`commit --allow-empty -m "lump work"`, projectRoot);
        git('checkout main', projectRoot);
    }

    it('skips running when the number of open branches meets maximumNumberOfConcurrentBranches', async () => {
        createAndPushLumpBranch('my-lump', 'ctx-a');
        createAndPushLumpBranch('my-lump', 'ctx-b');

        const result = await callRunLumpFromJsConfig(makeJsConfig({ maximumNumberOfConcurrentBranches: 2 }));

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.skipped).toBe(true);
        if (!result.data.skipped) throw new Error('unreachable');
        expect(result.data.openBranchCount).toBe(2);
        expect(result.data.maximumNumberOfConcurrentBranches).toBe(2);
        expect(result.data.reason).toBe('tooManyOpenBranches');
        expect(core.runLump).not.toHaveBeenCalled();
    });

    it('skips when the number of open branches exceeds maximumNumberOfConcurrentBranches', async () => {
        createAndPushLumpBranch('my-lump', 'ctx-a');
        createAndPushLumpBranch('my-lump', 'ctx-b');
        createAndPushLumpBranch('my-lump', 'ctx-c');

        const result = await callRunLumpFromJsConfig(makeJsConfig({ maximumNumberOfConcurrentBranches: 2 }));

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.skipped).toBe(true);
        expect(core.runLump).not.toHaveBeenCalled();
    });

    it('runs normally when the number of open branches is below maximumNumberOfConcurrentBranches', async () => {
        createAndPushLumpBranch('my-lump', 'ctx-a');

        vi.mocked(core.runLump).mockResolvedValue(
            core.success({
                result: {
                    branchName: 'some-branch',
                    contextNames: ['ctx1'],
                    contextRunStateList: [],
                },
            } as unknown as core.RunLumpOutput),
        );

        const result = await callRunLumpFromJsConfig(makeJsConfig({ maximumNumberOfConcurrentBranches: 2 }));

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.skipped).toBe(false);
        expect(core.runLump).toHaveBeenCalledOnce();
    });

    it('does not count local-only branches toward maximumNumberOfConcurrentBranches', async () => {
        createLocalOnlyLumpBranch('my-lump', 'ctx-a');
        createLocalOnlyLumpBranch('my-lump', 'ctx-b');

        vi.mocked(core.runLump).mockResolvedValue(
            core.success({
                result: {
                    branchName: 'some-branch',
                    contextNames: ['ctx1'],
                    contextRunStateList: [],
                },
            } as unknown as core.RunLumpOutput),
        );

        const result = await callRunLumpFromJsConfig(makeJsConfig({ maximumNumberOfConcurrentBranches: 2 }));

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.skipped).toBe(false);
        expect(core.runLump).toHaveBeenCalledOnce();
    });

    it('runs normally when maximumNumberOfConcurrentBranches is not set', async () => {
        createAndPushLumpBranch('my-lump', 'ctx-a');
        createAndPushLumpBranch('my-lump', 'ctx-b');
        createAndPushLumpBranch('my-lump', 'ctx-c');

        vi.mocked(core.runLump).mockResolvedValue(
            core.success({
                result: {
                    branchName: 'some-branch',
                    contextNames: ['ctx1'],
                    contextRunStateList: [],
                },
            } as unknown as core.RunLumpOutput),
        );

        const result = await callRunLumpFromJsConfig(makeJsConfig({}));

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.skipped).toBe(false);
        expect(core.runLump).toHaveBeenCalledOnce();
    });

    it('fails immediately when branch workspace lock is held (fail mode)', async () => {
        const held = await acquireBranchWorkspaceLock({
            globalConfigFolderPath,
            branchWorkspacePath: path.resolve(projectRoot),
            lumpName: 'holder',
            mode: 'fail',
        });
        expect(held.success).toBe(true);
        if (!held.success) throw new Error('unreachable');

        const result = await callRunLumpFromJsConfig(makeJsConfig({}));

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(isBranchWorkspaceBusyError(result.data)).toBe(true);
        expect(core.runLump).not.toHaveBeenCalled();

        await held.data();
    });

    it('does not acquire lock when run is skipped for tooManyOpenBranches', async () => {
        createAndPushLumpBranch('my-lump', 'ctx-a');
        createAndPushLumpBranch('my-lump', 'ctx-b');

        const result = await callRunLumpFromJsConfig(makeJsConfig({ maximumNumberOfConcurrentBranches: 2 }));

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.skipped).toBe(true);

        const locksDir = path.join(globalConfigFolderPath, 'branch-workspace-locks');
        await expect(fs.access(locksDir)).rejects.toMatchObject({ code: 'ENOENT' });
    });
});
