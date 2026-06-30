import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import * as core from '@lumpcode/core';

import { acquireBranchWorkspaceLock } from '../branchWorkspaceLock';
import {
    acquireExecutionWorkspaceLock,
} from '../executionWorkspaceLock';
import * as runProjectPreflightModule from '../runProjectPreflight';
import {
    isRunLumpBranchWorkspaceBusyFailure,
    isRunLumpExecutionWorkspaceBusyFailure,
    runLumpFromJsConfig,
    runLumpFromJsConfigFailureMessage,
} from './main';
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
        await fs.writeFile(
            path.join(localConfigFolderPath, 'local.json'),
            JSON.stringify({ mode: 'dedicated', discoveryBranch: 'main' }),
            'utf-8',
        );
        await fs.writeFile(
            path.join(localConfigFolderPath, 'project.json'),
            JSON.stringify({ projectName: 'run-from-js-test' }),
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

    function callRunLumpFromJsConfig(
        jsConfig: LumpJsConfig,
        overrides: Partial<Parameters<typeof runLumpFromJsConfig>[0]> = {},
    ) {
        return runLumpFromJsConfig({
            jsConfig,
            lumpName: 'my-lump',
            localConfigFolderPath,
            globalConfigFolderPath,
            sourceProjectRoot: projectRoot,
            logger: core.noopLogger,
            ...overrides,
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

    it('fails immediately when branch workspace lock is held (fail mode, worktree)', async () => {
        await fs.writeFile(
            path.join(localConfigFolderPath, 'local.json'),
            JSON.stringify({ mode: 'dedicated', discoveryBranch: 'main', workspaceStrategy: 'worktree' }),
            'utf-8',
        );
        const branchWorkspacePath = path.join(
            projectRoot,
            '.lumpcode',
            'worktrees',
            'lump',
            'my-lump',
            'ctx1',
        );
        const held = await acquireBranchWorkspaceLock({
            globalConfigFolderPath,
            branchWorkspacePath,
            lumpName: 'holder',
            mode: 'fail',
        });
        expect(held.success).toBe(true);
        if (!held.success) throw new Error('unreachable');

        const result = await callRunLumpFromJsConfig(makeJsConfig({}));

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(isRunLumpBranchWorkspaceBusyFailure(result.data)).toBe(true);
        expect(core.runLump).not.toHaveBeenCalled();

        await held.data();
    });

    it('fails immediately when execution workspace lock is held (fail mode)', async () => {
        const held = await acquireExecutionWorkspaceLock({
            globalConfigFolderPath,
            executionWorkspacePath: projectRoot,
            lumpName: 'holder',
            mode: 'fail',
        });
        expect(held.success).toBe(true);
        if (!held.success) throw new Error('unreachable');

        const result = await callRunLumpFromJsConfig(makeJsConfig({}));

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(isRunLumpExecutionWorkspaceBusyFailure(result.data)).toBe(true);
        expect(core.runLump).not.toHaveBeenCalled();

        await held.data();
    });

    it('does not acquire lock when run is skipped for tooManyOpenBranches', async () => {
        createAndPushLumpBranch('my-lump', 'ctx-a');
        createAndPushLumpBranch('my-lump', 'ctx-b');

        const preflightSpy = vi.spyOn(runProjectPreflightModule, 'runProjectPreflight');

        const result = await callRunLumpFromJsConfig(makeJsConfig({ maximumNumberOfConcurrentBranches: 2 }));

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.skipped).toBe(true);
        expect(preflightSpy).not.toHaveBeenCalled();

        const branchLocksDir = path.join(globalConfigFolderPath, 'branch-workspace-locks');
        const execLocksDir = path.join(globalConfigFolderPath, 'execution-workspace-locks');
        await expect(fs.access(branchLocksDir)).rejects.toMatchObject({ code: 'ENOENT' });
        await expect(fs.access(execLocksDir)).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('checkout dedicated uses only execution workspace lock for full run', async () => {
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

        const branchLocksDir = path.join(globalConfigFolderPath, 'branch-workspace-locks');
        await expect(fs.access(branchLocksDir)).rejects.toMatchObject({ code: 'ENOENT' });

        const execLocksDir = path.join(globalConfigFolderPath, 'execution-workspace-locks');
        const execLockFiles = await fs.readdir(execLocksDir).catch(() => []);
        expect(execLockFiles.filter((f) => f.endsWith('.lock.json'))).toHaveLength(0);
    });

    it('preflights to resolvedBaseBranch inside the orchestrator', async () => {
        vi.mocked(core.runLump).mockResolvedValue(
            core.success({
                result: {
                    branchName: 'some-branch',
                    contextNames: ['ctx1'],
                    contextRunStateList: [],
                },
            } as unknown as core.RunLumpOutput),
        );
        const preflightSpy = vi.spyOn(runProjectPreflightModule, 'runProjectPreflight');

        await callRunLumpFromJsConfig(makeJsConfig({ baseBranch: 'develop' }));

        expect(preflightSpy).toHaveBeenCalledWith(
            expect.objectContaining({ targetBranch: 'develop' }),
        );
    });

    it('fails before runLump when discoveryBranch is not in effective allowlist (dedicated)', async () => {
        await fs.writeFile(
            path.join(localConfigFolderPath, 'local.json'),
            JSON.stringify({
                mode: 'dedicated',
                discoveryBranch: 'main',
                discoveryBranches: ['main', 'ver/0.0.9'],
            }),
            'utf-8',
        );

        const result = await callRunLumpFromJsConfig(makeJsConfig({ discoveryBranch: 'ver/0.0.7' }));

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(runLumpFromJsConfigFailureMessage(result.data)).toMatch(
            /discoveryBranch|discoveryBranches|ver\/0\.0\.7/i,
        );
        expect(core.runLump).not.toHaveBeenCalled();
    });

    it('proceeds to runLump in shared mode when discoveryBranch is unlisted', async () => {
        await fs.writeFile(
            path.join(localConfigFolderPath, 'local.json'),
            JSON.stringify({ mode: 'shared', discoveryBranch: 'main' }),
            'utf-8',
        );
        vi.mocked(core.runLump).mockResolvedValue(
            core.success({
                result: {
                    branchName: 'some-branch',
                    contextNames: ['ctx1'],
                    contextRunStateList: [],
                },
            } as unknown as core.RunLumpOutput),
        );

        const result = await callRunLumpFromJsConfig(makeJsConfig({ discoveryBranch: 'ver/0.0.7' }));

        expect(result.success).toBe(true);
        expect(core.runLump).toHaveBeenCalled();
    });

    it('shared mode runs preflight to resolvedBaseBranch when contexts are pending', async () => {
        await fs.writeFile(
            path.join(localConfigFolderPath, 'local.json'),
            JSON.stringify({ mode: 'shared', discoveryBranch: 'main' }),
            'utf-8',
        );
        git('checkout -b ver/0.0.9', projectRoot);
        git('push -u origin ver/0.0.9', projectRoot);
        git('checkout main', projectRoot);

        vi.mocked(core.runLump).mockResolvedValue(
            core.success({
                result: {
                    branchName: 'some-branch',
                    contextNames: ['ctx1'],
                    contextRunStateList: [],
                },
            } as unknown as core.RunLumpOutput),
        );
        const preflightSpy = vi.spyOn(runProjectPreflightModule, 'runProjectPreflight');

        await callRunLumpFromJsConfig(makeJsConfig({ baseBranch: 'ver/0.0.9' }));

        expect(preflightSpy).toHaveBeenCalledWith(
            expect.objectContaining({ targetBranch: 'ver/0.0.9' }),
        );
    });

    it('worktree dedicated releases execution lock after setup while branch lock stays held', async () => {
        await fs.writeFile(
            path.join(localConfigFolderPath, 'local.json'),
            JSON.stringify({ mode: 'dedicated', discoveryBranch: 'main', workspaceStrategy: 'worktree' }),
            'utf-8',
        );

        const branchWorkspacePath = path.join(
            projectRoot,
            '.lumpcode',
            'worktrees',
            'lump',
            'my-lump',
            'ctx1',
        );
        const execLocksDir = path.join(globalConfigFolderPath, 'execution-workspace-locks');
        const branchLocksDir = path.join(globalConfigFolderPath, 'branch-workspace-locks');

        async function countLockFiles(dir: string): Promise<number> {
            const files = await fs.readdir(dir).catch(() => []);
            return files.filter((f) => f.endsWith('.lock.json')).length;
        }

        vi.mocked(core.runLump).mockImplementation(async (runInput) => {
            expect(runInput.setupWorkspaceFn).toBeTypeOf('function');
            const setup = await runInput.setupWorkspaceFn!({
                baseBranch: 'main',
                branchName: 'lump/my-lump/ctx1',
                contextList: [{ name: 'ctx1', variables: {} }],
                workspacePath: '.',
            });
            expect(setup.afterExec).toBeTypeOf('function');
            expect(await countLockFiles(execLocksDir)).toBe(1);
            expect(await countLockFiles(branchLocksDir)).toBe(1);

            await setup.afterExec!({ workspacePath: branchWorkspacePath });

            expect(await countLockFiles(execLocksDir)).toBe(0);
            expect(await countLockFiles(branchLocksDir)).toBe(1);

            return core.success({
                result: {
                    branchName: 'lump/my-lump/ctx1',
                    contextNames: ['ctx1'],
                    contextRunStateList: [],
                },
            } as unknown as core.RunLumpOutput);
        });

        const result = await callRunLumpFromJsConfig(makeJsConfig({}));
        expect(result.success).toBe(true);
        expect(await countLockFiles(execLocksDir)).toBe(0);
        expect(await countLockFiles(branchLocksDir)).toBe(0);
    });

    it('waits for execution workspace lock when lockMode is wait', async () => {
        const held = await acquireExecutionWorkspaceLock({
            globalConfigFolderPath,
            executionWorkspacePath: projectRoot,
            lumpName: 'holder',
            mode: 'fail',
        });
        expect(held.success).toBe(true);
        if (!held.success) throw new Error('unreachable');

        vi.mocked(core.runLump).mockResolvedValue(
            core.success({
                result: {
                    branchName: 'some-branch',
                    contextNames: ['ctx1'],
                    contextRunStateList: [],
                },
            } as unknown as core.RunLumpOutput),
        );

        const waiterPromise = callRunLumpFromJsConfig(makeJsConfig({}), { lockMode: 'wait' });
        await new Promise((resolve) => setTimeout(resolve, 50));
        await held.data();
        const waiter = await waiterPromise;

        expect(waiter.success).toBe(true);
        expect(core.runLump).toHaveBeenCalledOnce();
    });
});
