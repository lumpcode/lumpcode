import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { failure, noopLogger, success, type SetupWorkspaceFn } from '@lumpcode/core';

import { acquireBranchWorkspaceLock } from '../branchWorkspaceLock';
import { acquireExecutionWorkspaceLock } from '../executionWorkspaceLock';
import {
    createWorkspaceLockSession,
    releaseWorkspaceLockSession,
    withWorkspaceLockHooks,
} from './withWorkspaceLockHooks';
import {
    isRunLumpBranchWorkspaceBusyFailure,
    isRunLumpExecutionWorkspaceBusyFailure,
} from './failures';

describe('withWorkspaceLockHooks', () => {
    let globalConfigFolderPath: string;
    let executionWorkspacePath: string;

    beforeEach(async () => {
        globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-lock-hooks-'));
        executionWorkspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-lock-hooks-exec-'));
    });

    afterEach(async () => {
        await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
        await fs.rm(executionWorkspacePath, { recursive: true, force: true });
    });

    const setupInput = {
        baseBranch: 'main',
        branchName: 'lump/my-lump/ctx1',
        contextList: [{ name: 'ctx1', variables: {} }],
        workspacePath: '.',
    } as const;

    function makeInnerSetup(): SetupWorkspaceFn {
        return async () => ({
            command: 'echo setup',
            workspacePath: executionWorkspacePath,
        });
    }

    function makeCtx(overrides: Partial<Parameters<typeof withWorkspaceLockHooks>[0]['ctx']> = {}) {
        return {
            mode: 'dedicated' as const,
            workspaceStrategy: 'checkout' as const,
            executionWorkspacePath,
            globalConfigFolderPath,
            lumpName: 'my-lump',
            lockMode: 'fail' as const,
            logger: noopLogger,
            preflight: async () => success(undefined),
            ...overrides,
        };
    }

    it('acquires execution lock and runs preflight before inner setup (dedicated checkout)', async () => {
        const preflightSpy = vi.fn(async () => success(undefined));
        const session = createWorkspaceLockSession();
        const wrapped = withWorkspaceLockHooks({
            setupWorkspaceFn: makeInnerSetup(),
            session,
            ctx: makeCtx({ preflight: preflightSpy }),
        });

        await wrapped(setupInput);

        expect(preflightSpy).toHaveBeenCalledOnce();
        expect(session.releaseExecutionLock).toBeTypeOf('function');
        expect(session.releaseBranchLock).toBeUndefined();

        await releaseWorkspaceLockSession(session);
    });

    it('acquires branch lock for shared mode without execution lock', async () => {
        const session = createWorkspaceLockSession();
        const wrapped = withWorkspaceLockHooks({
            setupWorkspaceFn: makeInnerSetup(),
            session,
            ctx: makeCtx({ mode: 'shared' }),
        });

        await wrapped(setupInput);

        expect(session.releaseBranchLock).toBeTypeOf('function');
        expect(session.releaseExecutionLock).toBeUndefined();

        await releaseWorkspaceLockSession(session);
    });

    it('records branchWorkspaceBusy on session when branch lock is held (worktree)', async () => {
        const branchWorkspacePath = path.join(
            executionWorkspacePath,
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

        const innerSetup = vi.fn(makeInnerSetup());
        const session = createWorkspaceLockSession();
        const wrapped = withWorkspaceLockHooks({
            setupWorkspaceFn: innerSetup,
            session,
            ctx: makeCtx({ workspaceStrategy: 'worktree' }),
        });

        const setup = await wrapped(setupInput);
        expect(session.pendingFailure).toBeDefined();
        expect(isRunLumpBranchWorkspaceBusyFailure(session.pendingFailure!)).toBe(true);
        expect(innerSetup).not.toHaveBeenCalled();
        expect(setup.command).toContain('process.exit(1)');
        expect(session.releaseBranchLock).toBeUndefined();

        await held.data();
    });

    it('releases execution lock via afterExec for dedicated worktree', async () => {
        const execLocksDir = path.join(globalConfigFolderPath, 'execution-workspace-locks');
        const branchLocksDir = path.join(globalConfigFolderPath, 'branch-workspace-locks');
        const branchWorkspacePath = path.join(
            executionWorkspacePath,
            '.lumpcode',
            'worktrees',
            'lump',
            'my-lump',
            'ctx1',
        );

        async function countLockFiles(dir: string): Promise<number> {
            const files = await fs.readdir(dir).catch(() => []);
            return files.filter((f) => f.endsWith('.lock.json')).length;
        }

        const session = createWorkspaceLockSession();
        const wrapped = withWorkspaceLockHooks({
            setupWorkspaceFn: async () => ({
                command: 'echo setup',
                workspacePath: branchWorkspacePath,
            }),
            session,
            ctx: makeCtx({ workspaceStrategy: 'worktree' }),
        });

        const setup = await wrapped(setupInput);
        expect(await countLockFiles(execLocksDir)).toBe(1);
        expect(await countLockFiles(branchLocksDir)).toBe(1);

        await setup.afterExec!({ workspacePath: branchWorkspacePath });
        expect(await countLockFiles(execLocksDir)).toBe(0);
        expect(await countLockFiles(branchLocksDir)).toBe(1);

        await releaseWorkspaceLockSession(session);
        expect(await countLockFiles(branchLocksDir)).toBe(0);
    });

    it('records preflight failure on session after acquiring execution lock', async () => {
        const innerSetup = vi.fn(makeInnerSetup());
        const session = createWorkspaceLockSession();
        const wrapped = withWorkspaceLockHooks({
            setupWorkspaceFn: innerSetup,
            session,
            ctx: makeCtx({
                preflight: async () => failure('preflight failed'),
            }),
        });

        const setup = await wrapped(setupInput);
        expect(session.pendingFailure).toEqual({ kind: 'message', message: 'preflight failed' });
        expect(innerSetup).not.toHaveBeenCalled();
        expect(setup.command).toContain('process.exit(1)');
        expect(session.releaseExecutionLock).toBeTypeOf('function');

        await releaseWorkspaceLockSession(session);
    });

    it('records executionWorkspaceBusy before preflight when execution lock is held', async () => {
        const held = await acquireExecutionWorkspaceLock({
            globalConfigFolderPath,
            executionWorkspacePath,
            lumpName: 'holder',
            mode: 'fail',
        });
        expect(held.success).toBe(true);
        if (!held.success) throw new Error('unreachable');

        const preflightSpy = vi.fn(async () => success(undefined));
        const session = createWorkspaceLockSession();
        const wrapped = withWorkspaceLockHooks({
            setupWorkspaceFn: makeInnerSetup(),
            session,
            ctx: makeCtx({ preflight: preflightSpy }),
        });

        await wrapped(setupInput);
        expect(session.pendingFailure).toBeDefined();
        expect(isRunLumpExecutionWorkspaceBusyFailure(session.pendingFailure!)).toBe(true);
        expect(preflightSpy).not.toHaveBeenCalled();

        await held.data();
    });
});
