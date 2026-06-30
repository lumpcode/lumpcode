import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { createConsoleLogger } from '@lumpcode/core';

import {
    acquireWorkspaceFileLock,
    isWorkspaceFileBusyError,
    workspaceLockFilePath,
    workspaceLocksDirPath,
    type WorkspaceFileLockSpec,
} from './main';

const TEST_LOCK_SPEC = {
    locksSubdirName: 'test-workspace-locks',
    busyCode: 'testWorkspaceBusy',
    workspacePathField: 'testWorkspacePath',
    workspaceLabel: 'Test workspace',
    waitLogNoun: 'test workspace',
    staleLogNoun: 'test workspace lock',
} as const satisfies WorkspaceFileLockSpec;

describe('workspaceFileLock', () => {
    let globalConfigFolderPath: string;
    const workspacePath = path.join(os.tmpdir(), 'workspace-file-lock-test');

    beforeEach(async () => {
        globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-file-lock-global-'));
    });

    afterEach(async () => {
        await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
    });

    it('fail mode returns busy error when lock is held', async () => {
        const first = await acquireWorkspaceFileLock({
            spec: TEST_LOCK_SPEC,
            globalConfigFolderPath,
            workspacePath,
            lumpName: 'lump-a',
            mode: 'fail',
        });
        expect(first.success).toBe(true);
        if (!first.success) throw new Error('unreachable');

        const second = await acquireWorkspaceFileLock({
            spec: TEST_LOCK_SPEC,
            globalConfigFolderPath,
            workspacePath,
            lumpName: 'lump-b',
            mode: 'fail',
        });
        expect(second.success).toBe(false);
        if (second.success) throw new Error('unreachable');
        expect(isWorkspaceFileBusyError(second.data, TEST_LOCK_SPEC.busyCode)).toBe(true);
        if (!isWorkspaceFileBusyError(second.data, TEST_LOCK_SPEC.busyCode)) throw new Error('unreachable');
        expect(second.data.code).toBe('testWorkspaceBusy');
        expect(second.data.testWorkspacePath).toBe(path.resolve(workspacePath));
        expect(second.data.holderPid).toBe(process.pid);
        expect(second.data.holderLumpName).toBe('lump-a');

        await first.data();
    });

    it('wait mode blocks until the lock is released', async () => {
        const first = await acquireWorkspaceFileLock({
            spec: TEST_LOCK_SPEC,
            globalConfigFolderPath,
            workspacePath,
            lumpName: 'holder',
            mode: 'fail',
        });
        expect(first.success).toBe(true);
        if (!first.success) throw new Error('unreachable');
        const releaseFn = first.data;

        const waiterPromise = acquireWorkspaceFileLock({
            spec: TEST_LOCK_SPEC,
            globalConfigFolderPath,
            workspacePath,
            lumpName: 'waiter',
            mode: 'wait',
        });

        await new Promise((resolve) => setTimeout(resolve, 50));

        await releaseFn();
        const waiter = await waiterPromise;
        expect(waiter.success).toBe(true);
        if (waiter.success) await waiter.data();
    });

    it('logs a single wait line while waiting for the lock', async () => {
        vi.spyOn(console, 'log').mockImplementation(() => {});

        const first = await acquireWorkspaceFileLock({
            spec: TEST_LOCK_SPEC,
            globalConfigFolderPath,
            workspacePath,
            lumpName: 'holder',
            mode: 'fail',
        });
        expect(first.success).toBe(true);
        if (!first.success) throw new Error('unreachable');

        const logger = createConsoleLogger({ prefix: '[lumpcode]' });
        const waiterPromise = acquireWorkspaceFileLock({
            spec: TEST_LOCK_SPEC,
            globalConfigFolderPath,
            workspacePath,
            lumpName: 'waiter',
            mode: 'wait',
            logger,
        });

        await new Promise((resolve) => setTimeout(resolve, 50));
        await first.data();
        await waiterPromise;

        expect(console.log).toHaveBeenCalledTimes(1);
        const loggedLine = vi.mocked(console.log).mock.calls[0]?.[0];
        expect(typeof loggedLine).toBe('string');
        expect(loggedLine).toMatch(/^\[lumpcode\] test workspace busy at "/);
        expect(loggedLine).not.toMatch(/\[lumpcode\] \[lumpcode\]/);

        vi.restoreAllMocks();
    });

    it('recovers stale lock when holder pid is dead', async () => {
        const lockFilePath = workspaceLockFilePath({
            globalConfigFolderPath,
            workspacePath,
            spec: TEST_LOCK_SPEC,
        });
        await fs.mkdir(workspaceLocksDirPath({ globalConfigFolderPath, spec: TEST_LOCK_SPEC }), {
            recursive: true,
        });
        await fs.writeFile(
            lockFilePath,
            `${JSON.stringify({
                pid: 999999999,
                lumpName: 'ghost',
                testWorkspacePath: path.resolve(workspacePath),
                startedAt: new Date().toISOString(),
            })}\n`,
            'utf8',
        );

        const acquired = await acquireWorkspaceFileLock({
            spec: TEST_LOCK_SPEC,
            globalConfigFolderPath,
            workspacePath,
            lumpName: 'recovery',
            mode: 'fail',
        });
        expect(acquired.success).toBe(true);
        if (acquired.success) await acquired.data();
    });

    it('allows concurrent locks on different workspace paths', async () => {
        const pathA = path.join(os.tmpdir(), 'workspace-file-lock-a');
        const pathB = path.join(os.tmpdir(), 'workspace-file-lock-b');

        const lockA = await acquireWorkspaceFileLock({
            spec: TEST_LOCK_SPEC,
            globalConfigFolderPath,
            workspacePath: pathA,
            lumpName: 'a',
            mode: 'fail',
        });
        const lockB = await acquireWorkspaceFileLock({
            spec: TEST_LOCK_SPEC,
            globalConfigFolderPath,
            workspacePath: pathB,
            lumpName: 'b',
            mode: 'fail',
        });

        expect(lockA.success).toBe(true);
        expect(lockB.success).toBe(true);

        if (lockA.success) await lockA.data();
        if (lockB.success) await lockB.data();
    });

    it('release only removes lock file when pid matches', async () => {
        const lockFilePath = workspaceLockFilePath({
            globalConfigFolderPath,
            workspacePath,
            spec: TEST_LOCK_SPEC,
        });

        const acquired = await acquireWorkspaceFileLock({
            spec: TEST_LOCK_SPEC,
            globalConfigFolderPath,
            workspacePath,
            lumpName: 'mine',
            mode: 'fail',
        });
        expect(acquired.success).toBe(true);
        if (!acquired.success) throw new Error('unreachable');

        await fs.writeFile(
            lockFilePath,
            `${JSON.stringify({
                pid: process.pid + 1,
                lumpName: 'other',
                testWorkspacePath: path.resolve(workspacePath),
                startedAt: new Date().toISOString(),
            })}\n`,
            'utf8',
        );

        await acquired.data();
        await expect(fs.access(lockFilePath)).resolves.toBeUndefined();
    });
});
