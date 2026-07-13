import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import * as core from '@lumpcode/core';

import { noopLogger } from '../noopLogger';

import { acquireWorkspacePathLock } from '../workspacePathLock';
import * as runProjectPreflightModule from '../runProjectPreflight';
import {
    isRunLumpWorkspacePathBusyFailure,
    runLumpFromJsConfig,
    runLumpFromJsConfigFailureMessage,
} from './main';
import { LUMP_BRANCH_PREFIX } from '../../consts';
import type { LumpJsConfig } from '../../types';
import { execGit } from '../execGit';


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
            JSON.stringify({ mode: 'dedicated', primaryBranch: 'main' }),
            'utf-8',
        );
        await fs.writeFile(
            path.join(localConfigFolderPath, 'project.json'),
            JSON.stringify({ projectName: 'run-from-js-test' }),
            'utf-8',
        );

        execGit('init --bare', remoteDir);
        execGit('init -b main', projectRoot);
        execGit('config user.email "test@test.com"', projectRoot);
        execGit('config user.name "Test"', projectRoot);
        execGit('commit --allow-empty -m "init"', projectRoot);
        execGit(`remote add origin ${remoteDir}`, projectRoot);
        execGit('push -u origin main', projectRoot);

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
            logger: noopLogger,
            ...overrides,
        });
    }

    const defaultSetupInput = {
        baseBranch: 'main',
        branchName: 'lump/my-lump/ctx1',
        contextList: [{ name: 'ctx1', variables: {} }],
    };

    function mockRunLumpInvokingSetup(
        runResult: core.RunLumpOutput = {
            result: {
                branchName: 'lump/my-lump/ctx1',
                contextNames: ['ctx1'],
                contextRunStateList: [],
            },
        } as unknown as core.RunLumpOutput,
    ) {
        vi.mocked(core.runLump).mockImplementation(async (runInput) => {
            await runInput.setupWorkspaceFn!(defaultSetupInput);
            return core.success(runResult);
        });
    }

    function createAndPushLumpBranch(lumpName: string, contextName: string) {
        const branch = `${LUMP_BRANCH_PREFIX}${lumpName}/${contextName}`;
        execGit('checkout main', projectRoot);
        execGit(`checkout -b ${branch}`, projectRoot);
        execGit(`commit --allow-empty -m "lump work"`, projectRoot);
        execGit(`push origin ${branch}`, projectRoot);
        execGit('checkout main', projectRoot);
    }

    function createLocalOnlyLumpBranch(lumpName: string, contextName: string) {
        const branch = `${LUMP_BRANCH_PREFIX}${lumpName}/${contextName}`;
        execGit('checkout main', projectRoot);
        execGit(`checkout -b ${branch}`, projectRoot);
        execGit(`commit --allow-empty -m "lump work"`, projectRoot);
        execGit('checkout main', projectRoot);
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
            JSON.stringify({ mode: 'dedicated', primaryBranch: 'main', workspaceStrategy: 'worktree' }),
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
        const held = await acquireWorkspacePathLock({
            globalConfigFolderPath,
            workspacePath: branchWorkspacePath,
            lumpName: 'holder',
            mode: 'fail',
        });
        expect(held.success).toBe(true);
        if (!held.success) throw new Error('unreachable');

        mockRunLumpInvokingSetup();

        const result = await callRunLumpFromJsConfig(makeJsConfig({}));

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(isRunLumpWorkspacePathBusyFailure(result.data)).toBe(true);
        expect(core.runLump).toHaveBeenCalledOnce();

        await held.data();
    });

    it('fails when execution workspace lock is held at setup time (fail mode)', async () => {
        const held = await acquireWorkspacePathLock({
            globalConfigFolderPath,
            workspacePath: projectRoot,
            lumpName: 'holder',
            mode: 'fail',
        });
        expect(held.success).toBe(true);
        if (!held.success) throw new Error('unreachable');

        mockRunLumpInvokingSetup();

        const result = await callRunLumpFromJsConfig(makeJsConfig({}));

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(isRunLumpWorkspacePathBusyFailure(result.data)).toBe(true);
        expect(core.runLump).toHaveBeenCalledOnce();

        await held.data();
    });

    it('does not preflight or acquire locks when core returns early with no work', async () => {
        vi.mocked(core.runLump).mockResolvedValue(
            core.success({
                result: {
                    updatedGroupStatusRecord: { data: {} },
                    branchName: '',
                    contextNames: [],
                    contextRunStateList: [],
                },
            } as unknown as core.RunLumpOutput),
        );
        const preflightSpy = vi.spyOn(runProjectPreflightModule, 'runProjectPreflight');

        await callRunLumpFromJsConfig(makeJsConfig({}));

        expect(preflightSpy).not.toHaveBeenCalled();
        const locksDir = path.join(globalConfigFolderPath, 'workspace-path-locks');
        await expect(fs.access(locksDir)).rejects.toMatchObject({ code: 'ENOENT' });
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

        const locksDir = path.join(globalConfigFolderPath, 'workspace-path-locks');
        await expect(fs.access(locksDir)).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('releases a phase-1 releaseLock when tooManyOpenBranches skips', async () => {
        createAndPushLumpBranch('my-lump', 'ctx-a');
        createAndPushLumpBranch('my-lump', 'ctx-b');

        const held = await acquireWorkspacePathLock({
            globalConfigFolderPath,
            workspacePath: projectRoot,
            lumpName: 'phase1-handoff',
            mode: 'fail',
        });
        expect(held.success).toBe(true);
        if (!held.success) throw new Error('unreachable');

        const result = await callRunLumpFromJsConfig(makeJsConfig({ maximumNumberOfConcurrentBranches: 2 }), {
            releaseLock: held.data,
        });

        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(result.data.skipped).toBe(true);
        if (!result.data.skipped) throw new Error('unreachable');
        expect(result.data.reason).toBe('tooManyOpenBranches');
        expect(core.runLump).not.toHaveBeenCalled();

        const locksDir = path.join(globalConfigFolderPath, 'workspace-path-locks');
        const lockFiles = await fs.readdir(locksDir).catch(() => []);
        expect(lockFiles.filter((f) => f.endsWith('.lock.json'))).toHaveLength(0);
    });

    it('checkout dedicated uses path lock for full run', async () => {
        mockRunLumpInvokingSetup();

        const result = await callRunLumpFromJsConfig(makeJsConfig({}));

        expect(result.success).toBe(true);

        const locksDir = path.join(globalConfigFolderPath, 'workspace-path-locks');
        const lockFiles = await fs.readdir(locksDir).catch(() => []);
        expect(lockFiles.filter((f) => f.endsWith('.lock.json'))).toHaveLength(0);
    });

    it('preflights to resolvedBaseBranch when setup is invoked', async () => {
        mockRunLumpInvokingSetup();
        const preflightSpy = vi.spyOn(runProjectPreflightModule, 'runProjectPreflight');

        await callRunLumpFromJsConfig(makeJsConfig({ baseBranch: 'develop' }));

        expect(preflightSpy).toHaveBeenCalledWith(
            expect.objectContaining({ targetBranch: 'develop' }),
        );
    });

    it('proceeds to runLump in shared mode when discoveryBranch is unlisted', async () => {
        await fs.writeFile(
            path.join(localConfigFolderPath, 'local.json'),
            JSON.stringify({ mode: 'shared', primaryBranch: 'main' }),
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

    it('shared mode runs preflight to resolvedBaseBranch when setup is invoked', async () => {
        await fs.writeFile(
            path.join(localConfigFolderPath, 'local.json'),
            JSON.stringify({ mode: 'shared', primaryBranch: 'main' }),
            'utf-8',
        );
        execGit('checkout -b ver/0.0.9', projectRoot);
        execGit('push -u origin ver/0.0.9', projectRoot);
        execGit('checkout main', projectRoot);

        mockRunLumpInvokingSetup();
        const preflightSpy = vi.spyOn(runProjectPreflightModule, 'runProjectPreflight');

        await callRunLumpFromJsConfig(makeJsConfig({ baseBranch: 'ver/0.0.9' }));

        expect(preflightSpy).toHaveBeenCalledWith(
            expect.objectContaining({ targetBranch: 'ver/0.0.9' }),
        );
    });

    it('worktree dedicated releases execution lock after setup while branch lock stays held', async () => {
        await fs.writeFile(
            path.join(localConfigFolderPath, 'local.json'),
            JSON.stringify({ mode: 'dedicated', primaryBranch: 'main', workspaceStrategy: 'worktree' }),
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
        const locksDir = path.join(globalConfigFolderPath, 'workspace-path-locks');

        async function countLockFiles(): Promise<number> {
            const files = await fs.readdir(locksDir).catch(() => []);
            return files.filter((f) => f.endsWith('.lock.json')).length;
        }

        vi.mocked(core.runLump).mockImplementation(async (runInput) => {
            expect(runInput.setupWorkspaceFn).toBeTypeOf('function');
            const setup = await runInput.setupWorkspaceFn!({
                baseBranch: 'main',
                branchName: 'lump/my-lump/ctx1',
                contextList: [{ name: 'ctx1', variables: {} }],
            });
            expect(setup.afterExec).toBeTypeOf('function');
            expect(await countLockFiles()).toBe(2);

            await setup.afterExec!({ workspacePath: branchWorkspacePath });

            expect(await countLockFiles()).toBe(1);

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
        expect(await countLockFiles()).toBe(0);
    });

    it('waits for workspace path lock when lockMode is wait', async () => {
        const held = await acquireWorkspacePathLock({
            globalConfigFolderPath,
            workspacePath: projectRoot,
            lumpName: 'holder',
            mode: 'fail',
        });
        expect(held.success).toBe(true);
        if (!held.success) throw new Error('unreachable');

        let setupEntered = false;
        vi.mocked(core.runLump).mockImplementation(async (runInput) => {
            setupEntered = true;
            await runInput.setupWorkspaceFn!(defaultSetupInput);
            return core.success({
                result: {
                    branchName: 'lump/my-lump/ctx1',
                    contextNames: ['ctx1'],
                    contextRunStateList: [],
                },
            } as unknown as core.RunLumpOutput);
        });

        const waiterPromise = callRunLumpFromJsConfig(makeJsConfig({}), { lockMode: 'wait' });
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(setupEntered).toBe(true);
        await held.data();
        const waiter = await waiterPromise;

        expect(waiter.success).toBe(true);
        expect(core.runLump).toHaveBeenCalledOnce();
    });
});
