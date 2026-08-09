import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { failure, success, type SetupWorkspaceFn } from '@lumpcode/core';

import { noopLogger } from '../noopLogger';

import { acquireWorkspacePathLock } from '../workspacePathLock';
import {
    createWorkspaceLockSession,
    releaseWorkspaceLockSession,
    releaseWorkspaceLockSessionSync,
    withWorkspaceLockHooks,
} from './withWorkspaceLockHooks';
import { isRunLumpWorkspacePathBusyFailure } from './failures';

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
    };

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

    it('acquires execution path lock and runs preflight before inner setup (dedicated checkout)', async () => {
        const preflightSpy = vi.fn(async () => success(undefined));
        const session = createWorkspaceLockSession();
        const wrapped = withWorkspaceLockHooks({
            setupWorkspaceFn: makeInnerSetup(),
            session,
            ctx: makeCtx({ preflight: preflightSpy }),
        });

        await wrapped(setupInput);

        expect(preflightSpy).toHaveBeenCalledOnce();
        expect(session.releaseExecutionPathLock).toBeTypeOf('function');
        expect(session.releaseBranchPathLock).toBeUndefined();

        await releaseWorkspaceLockSession(session);
    });

    it('skips re-acquire when session already holds execution path lock (phase 1 handoff)', async () => {
        const acquired = await acquireWorkspacePathLock({
            globalConfigFolderPath,
            workspacePath: executionWorkspacePath,
            lumpName: 'phase1',
            mode: 'fail',
        });
        expect(acquired.success).toBe(true);
        if (!acquired.success) throw new Error('unreachable');

        const session = createWorkspaceLockSession();
        session.releaseExecutionPathLock = acquired.data;
        const wrapped = withWorkspaceLockHooks({
            setupWorkspaceFn: makeInnerSetup(),
            session,
            ctx: makeCtx(),
        });

        await wrapped(setupInput);
        expect(session.releaseExecutionPathLock).toBe(acquired.data);

        const locksDir = path.join(globalConfigFolderPath, 'workspace-path-locks');
        const lockFiles = await fs.readdir(locksDir);
        expect(lockFiles.filter((f) => f.endsWith('.lock.json'))).toHaveLength(1);

        await releaseWorkspaceLockSession(session);
        expect((await fs.readdir(locksDir)).filter((f) => f.endsWith('.lock.json'))).toHaveLength(0);
    });

    it('acquires path lock for shared mode', async () => {
        const session = createWorkspaceLockSession();
        const wrapped = withWorkspaceLockHooks({
            setupWorkspaceFn: makeInnerSetup(),
            session,
            ctx: makeCtx({ mode: 'shared' }),
        });

        await wrapped(setupInput);

        expect(session.releaseBranchPathLock).toBeTypeOf('function');
        expect(session.releaseExecutionPathLock).toBeUndefined();

        await releaseWorkspaceLockSession(session);
    });

    it('records workspacePathBusy on session when worktree branch path lock is held', async () => {
        const branchWorkspacePath = path.join(
            executionWorkspacePath,
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

        const innerSetup = vi.fn(makeInnerSetup());
        const session = createWorkspaceLockSession();
        const wrapped = withWorkspaceLockHooks({
            setupWorkspaceFn: innerSetup,
            session,
            ctx: makeCtx({ workspaceStrategy: 'worktree' }),
        });

        const setup = await wrapped(setupInput);
        expect(session.pendingFailure).toBeDefined();
        expect(isRunLumpWorkspacePathBusyFailure(session.pendingFailure!)).toBe(true);
        expect(innerSetup).not.toHaveBeenCalled();
        expect(setup.command).toContain('process.exit(1)');
        expect(session.releaseBranchPathLock).toBeUndefined();

        await held.data();
        await releaseWorkspaceLockSession(session);
    });

    it('releases execution path lock after setup returns for dedicated worktree', async () => {
        const locksDir = path.join(globalConfigFolderPath, 'workspace-path-locks');
        const branchWorkspacePath = path.join(
            executionWorkspacePath,
            '.lumpcode',
            'worktrees',
            'lump',
            'my-lump',
            'ctx1',
        );

        async function countLockFiles(): Promise<number> {
            const files = await fs.readdir(locksDir).catch(() => []);
            return files.filter((f) => f.endsWith('.lock.json')).length;
        }

        const session = createWorkspaceLockSession();
        const wrapped = withWorkspaceLockHooks({
            setupWorkspaceFn: async () => ({
                command: '',
                workspacePath: branchWorkspacePath,
            }),
            session,
            ctx: makeCtx({ workspaceStrategy: 'worktree' }),
        });

        const setup = await wrapped(setupInput);
        expect(setup.command).toBe('');
        // execution path lock released; branch path lock still held
        expect(await countLockFiles()).toBe(1);
        expect(session.releaseExecutionPathLock).toBeUndefined();
        expect(session.releaseBranchPathLock).toBeTypeOf('function');

        await releaseWorkspaceLockSession(session);
        expect(await countLockFiles()).toBe(0);
    });

    it('records preflight failure on session after acquiring execution path lock', async () => {
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
        expect(session.releaseExecutionPathLock).toBeTypeOf('function');

        await releaseWorkspaceLockSession(session);
    });

    it('records workspacePathBusy before preflight when execution path lock is held', async () => {
        const held = await acquireWorkspacePathLock({
            globalConfigFolderPath,
            workspacePath: executionWorkspacePath,
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
        expect(isRunLumpWorkspacePathBusyFailure(session.pendingFailure!)).toBe(true);
        expect(preflightSpy).not.toHaveBeenCalled();

        await held.data();
    });

    it('releaseWorkspaceLockSessionSync clears held path locks', async () => {
        const session = createWorkspaceLockSession();
        const wrapped = withWorkspaceLockHooks({
            setupWorkspaceFn: makeInnerSetup(),
            session,
            ctx: makeCtx(),
        });
        await wrapped(setupInput);
        expect(session.releaseExecutionPathLock).toBeTypeOf('function');

        releaseWorkspaceLockSessionSync(session);
        expect(session.releaseExecutionPathLock).toBeUndefined();

        const reacquired = await acquireWorkspacePathLock({
            globalConfigFolderPath,
            workspacePath: executionWorkspacePath,
            lumpName: 'after-sync',
            mode: 'fail',
        });
        expect(reacquired.success).toBe(true);
        if (reacquired.success) await reacquired.data();
    });
});
