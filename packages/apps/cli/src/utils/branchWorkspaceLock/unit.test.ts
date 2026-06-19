import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { createConsoleLogger } from '@lumpcode/core';

import {
    acquireBranchWorkspaceLock,
    branchWorkspaceLockFilePath,
    branchWorkspaceLocksDirPath,
    isBranchWorkspaceBusyError,
} from './main';

describe('branchWorkspaceLock', () => {
    let globalConfigFolderPath: string;
    const branchWorkspacePath = path.join(os.tmpdir(), 'lump-lock-test-workspace');

    beforeEach(async () => {
        globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-branch-lock-global-'));
    });

    afterEach(async () => {
        await fs.rm(globalConfigFolderPath, { recursive: true, force: true });
    });

    it('fail mode returns branchWorkspaceBusy when lock is held', async () => {
        const first = await acquireBranchWorkspaceLock({
            globalConfigFolderPath,
            branchWorkspacePath,
            lumpName: 'lump-a',
            mode: 'fail',
        });
        expect(first.success).toBe(true);
        if (!first.success) throw new Error('unreachable');

        const second = await acquireBranchWorkspaceLock({
            globalConfigFolderPath,
            branchWorkspacePath,
            lumpName: 'lump-b',
            mode: 'fail',
        });
        expect(second.success).toBe(false);
        if (second.success) throw new Error('unreachable');
        expect(isBranchWorkspaceBusyError(second.data)).toBe(true);
        if (!isBranchWorkspaceBusyError(second.data)) throw new Error('unreachable');
        expect(second.data.code).toBe('branchWorkspaceBusy');
        expect(second.data.branchWorkspacePath).toBe(branchWorkspacePath);
        expect(second.data.holderPid).toBe(process.pid);
        expect(second.data.holderLumpName).toBe('lump-a');

        await first.data();
    });

    it('wait mode blocks until the lock is released', async () => {
        const first = await acquireBranchWorkspaceLock({
            globalConfigFolderPath,
            branchWorkspacePath,
            lumpName: 'holder',
            mode: 'fail',
        });
        expect(first.success).toBe(true);
        if (!first.success) throw new Error('unreachable');
        const releaseFn = first.data;

        const waiterPromise = acquireBranchWorkspaceLock({
            globalConfigFolderPath,
            branchWorkspacePath,
            lumpName: 'waiter',
            mode: 'wait',
        });

        await new Promise((resolve) => setTimeout(resolve, 50));

        await releaseFn();
        const waiter = await waiterPromise;
        expect(waiter.success).toBe(true);
        if (waiter.success) await waiter.data();
    });

    it('logs a single logger prefix while waiting for the lock', async () => {
        vi.spyOn(console, 'log').mockImplementation(() => {});

        const first = await acquireBranchWorkspaceLock({
            globalConfigFolderPath,
            branchWorkspacePath,
            lumpName: 'holder',
            mode: 'fail',
        });
        expect(first.success).toBe(true);
        if (!first.success) throw new Error('unreachable');

        const logger = createConsoleLogger({ prefix: '[lumpcode]' });
        const waiterPromise = acquireBranchWorkspaceLock({
            globalConfigFolderPath,
            branchWorkspacePath,
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
        expect(loggedLine).toMatch(/^\[lumpcode\] branch workspace busy at "/);
        expect(loggedLine).not.toMatch(/\[lumpcode\] \[lumpcode\]/);

        vi.restoreAllMocks();
    });

    it('recovers stale lock when holder pid is dead', async () => {
        const lockFilePath = branchWorkspaceLockFilePath({
            globalConfigFolderPath,
            branchWorkspacePath,
        });
        await fs.mkdir(branchWorkspaceLocksDirPath({ globalConfigFolderPath }), { recursive: true });
        await fs.writeFile(
            lockFilePath,
            `${JSON.stringify({
                pid: 999999999,
                lumpName: 'ghost',
                branchWorkspacePath,
                startedAt: new Date().toISOString(),
            })}\n`,
            'utf8',
        );

        const acquired = await acquireBranchWorkspaceLock({
            globalConfigFolderPath,
            branchWorkspacePath,
            lumpName: 'recovery',
            mode: 'fail',
        });
        expect(acquired.success).toBe(true);
        if (acquired.success) await acquired.data();
    });

    it('allows concurrent locks on different branch workspace paths', async () => {
        const pathA = path.join(os.tmpdir(), 'lump-lock-a');
        const pathB = path.join(os.tmpdir(), 'lump-lock-b');

        const lockA = await acquireBranchWorkspaceLock({
            globalConfigFolderPath,
            branchWorkspacePath: pathA,
            lumpName: 'a',
            mode: 'fail',
        });
        const lockB = await acquireBranchWorkspaceLock({
            globalConfigFolderPath,
            branchWorkspacePath: pathB,
            lumpName: 'b',
            mode: 'fail',
        });

        expect(lockA.success).toBe(true);
        expect(lockB.success).toBe(true);

        if (lockA.success) await lockA.data();
        if (lockB.success) await lockB.data();
    });
});
