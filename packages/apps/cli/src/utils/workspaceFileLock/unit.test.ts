import * as crypto from 'node:crypto';
import { readdirSync, unlinkSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { createConsoleLogger } from '@lumpcode/core';

import {
    acquireWorkspaceFileLock,
    isWorkspaceFileBusyError,
    removeWorkspaceFileLocksHeldByDeadPid,
    workspaceLegacyLockFilePath,
    workspaceLocksDirPath,
    type WorkspaceFileLockSpec,
} from './main';
import { readProcessStartId } from '../processStartId';
import { writeJsonFile } from '../writeJsonFile';

/** Lets a test pause the lock code right before an fs call, to force an interleaving. */
const fsGate = vi.hoisted(() => ({
    beforeUnlink: undefined as undefined | ((filePath: string) => Promise<void>),
    beforeReaddir: undefined as undefined | (() => Promise<void>),
}));
vi.mock('node:fs/promises', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:fs/promises')>();
    return {
        ...actual,
        unlink: async (filePath: Parameters<typeof actual.unlink>[0]) => {
            await fsGate.beforeUnlink?.(String(filePath));
            return actual.unlink(filePath);
        },
        readdir: async (...args: Parameters<typeof actual.readdir>) => {
            await fsGate.beforeReaddir?.();
            return actual.readdir(...args);
        },
    };
});

/** A promise the test opens by hand, plus a promise that resolves once code reaches the gate. */
function manualGate() {
    let open!: () => void;
    let markReached!: () => void;
    const opened = new Promise<void>((resolve) => (open = resolve));
    const reached = new Promise<void>((resolve) => (markReached = resolve));
    return { open, reached, wait: async () => (markReached(), opened) };
}

const TEST_LOCK_SPEC = {
    locksSubdirName: 'test-workspace-locks',
    busyCode: 'testWorkspaceBusy',
    workspacePathField: 'testWorkspacePath',
    workspaceLabel: 'Test workspace',
    waitLogNoun: 'test workspace',
    staleLogNoun: 'test workspace lock',
} as const satisfies WorkspaceFileLockSpec;

const startIdSupported = process.platform === 'linux' || process.platform === 'darwin';

describe('workspaceFileLock', () => {
    let globalConfigFolderPath: string;
    const workspacePath = path.join(os.tmpdir(), 'workspace-file-lock-test');

    beforeEach(async () => {
        globalConfigFolderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-file-lock-global-'));
    });

    afterEach(async () => {
        fsGate.beforeUnlink = undefined;
        fsGate.beforeReaddir = undefined;
        await fs.chmod(globalConfigFolderPath, 0o700).catch(() => {});
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

    it('wait mode times out with reason waitTimedOut', async () => {
        const first = await acquireWorkspaceFileLock({
            spec: TEST_LOCK_SPEC,
            globalConfigFolderPath,
            workspacePath,
            lumpName: 'holder',
            mode: 'fail',
        });
        expect(first.success).toBe(true);
        if (!first.success) throw new Error('unreachable');

        const second = await acquireWorkspaceFileLock({
            spec: TEST_LOCK_SPEC,
            globalConfigFolderPath,
            workspacePath,
            lumpName: 'waiter',
            mode: 'wait',
            waitTimeoutMs: 40,
            waitLogIntervalMs: 20,
        });
        expect(second.success).toBe(false);
        if (second.success) throw new Error('unreachable');
        expect(isWorkspaceFileBusyError(second.data, TEST_LOCK_SPEC.busyCode)).toBe(true);
        expect(second.data.reason).toBe('waitTimedOut');
        expect(second.data.message).toMatch(/Waited 40ms/);
        expect(second.data.holderLumpName).toBe('holder');

        await first.data();
    });

    it('re-logs still waiting after the wait log interval', async () => {
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
            waitTimeoutMs: 10_000,
            waitLogIntervalMs: 30,
            logger,
        });

        // Wait for the re-log before releasing — a fixed sleep can race the 500ms poll
        // and acquire without ever emitting "still waiting" under suite load.
        await vi.waitFor(
            () => {
                const lines = vi.mocked(console.log).mock.calls.map((call) => String(call[0]));
                expect(lines.some((line) => line.includes('still waiting'))).toBe(true);
            },
            { timeout: 8_000, interval: 25 },
        );

        await first.data();
        await waiterPromise;

        const lines = vi.mocked(console.log).mock.calls.map((call) => String(call[0]));
        expect(lines.some((line) => line.includes('waiting…') && !line.includes('still waiting'))).toBe(
            true,
        );
        expect(lines.some((line) => line.includes('still waiting'))).toBe(true);

        vi.restoreAllMocks();
    });

    it('fail mode busy error has no waitTimedOut reason', async () => {
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
        expect(second.data.reason).toBeUndefined();

        await first.data();
    });

    function locksDir(): string {
        return workspaceLocksDirPath({ globalConfigFolderPath, spec: TEST_LOCK_SPEC });
    }

    function legacyPath(): string {
        return workspaceLegacyLockFilePath({ globalConfigFolderPath, workspacePath, spec: TEST_LOCK_SPEC });
    }

    /** Writes a lock file as another acquisition would name it. */
    async function writeLockFile(owner: { pid: number; startId?: string; lumpName?: string }): Promise<string> {
        await fs.mkdir(locksDir(), { recursive: true });
        const pathHash = path.basename(legacyPath(), '.lock.json');
        const token = crypto.randomUUID();
        const filePath = path.join(locksDir(), `${pathHash}.${owner.pid}.${owner.startId ?? 'x'}.${token}.lock`);
        await writeJsonFile({
            filePath,
            data: { pid: owner.pid, token, lumpName: owner.lumpName ?? 'other', startedAt: new Date().toISOString() },
        });
        return filePath;
    }

    async function lockFiles(): Promise<string[]> {
        return (await fs.readdir(locksDir())).filter((f) => f.endsWith('.lock'));
    }

    function acquire(lumpName: string) {
        return acquireWorkspaceFileLock({ spec: TEST_LOCK_SPEC, globalConfigFolderPath, workspacePath, lumpName, mode: 'fail' });
    }

    it('allows concurrent locks on different workspace paths', async () => {
        const pathA = path.join(os.tmpdir(), 'workspace-file-lock-a');
        const pathB = path.join(os.tmpdir(), 'workspace-file-lock-b');
        const lock = (p: string, lumpName: string) =>
            acquireWorkspaceFileLock({ spec: TEST_LOCK_SPEC, globalConfigFolderPath, workspacePath: p, lumpName, mode: 'fail' });

        const lockA = await lock(pathA, 'a');
        const lockB = await lock(pathB, 'b');
        expect(lockA.success).toBe(true);
        expect(lockB.success).toBe(true);
        if (lockA.success) await lockA.data();
        if (lockB.success) await lockB.data();
    });

    it('release and sync release delete only their own lock files', async () => {
        const first = await acquire('first');
        if (!first.success) throw new Error('first should acquire');
        expect(await lockFiles()).toHaveLength(1);
        await expect(fs.access(legacyPath())).resolves.toBeUndefined();
        const foreign = await writeLockFile({ pid: process.ppid });

        await first.data();
        expect(await lockFiles()).toEqual([path.basename(foreign)]);
        await expect(fs.access(legacyPath())).rejects.toMatchObject({ code: 'ENOENT' });
        await fs.unlink(foreign);

        const second = await acquire('second');
        if (!second.success) throw new Error('second should acquire');
        second.data.sync();
        expect(await lockFiles()).toEqual([]);
        await expect(fs.access(legacyPath())).rejects.toMatchObject({ code: 'ENOENT' });
    });

    describe('liveness', () => {
        it('deletes a lock file whose pid is dead and acquires', async () => {
            const dead = await writeLockFile({ pid: 999_999_999 });

            const acquired = await acquire('recovery');
            expect(acquired.success).toBe(true);
            await expect(fs.access(dead)).rejects.toMatchObject({ code: 'ENOENT' });
            if (acquired.success) await acquired.data();
        });

        it('treats a same-pid lock file this process does not hold as stale', async () => {
            const startId = (await readProcessStartId(process.pid)) ?? 'x';
            await writeLockFile({ pid: process.pid, startId, lumpName: 'previous-run' });

            const acquired = await acquire('fresh');
            expect(acquired.success).toBe(true);
            if (acquired.success) await acquired.data();
        });

        it.runIf(startIdSupported)('treats a live pid with another start id as reused, so stale', async () => {
            await writeLockFile({ pid: process.ppid, startId: '1' });

            const acquired = await acquire('fresh');
            expect(acquired.success).toBe(true);
            if (acquired.success) await acquired.data();
        });

        it('treats a live pid with its own start id as busy', async () => {
            const startId = (await readProcessStartId(process.ppid)) ?? 'x';
            await writeLockFile({ pid: process.ppid, startId, lumpName: 'parent' });

            const contender = await acquire('contender');
            expect(contender.success).toBe(false);
            if (contender.success) throw new Error('unreachable');
            expect(contender.data.holderPid).toBe(process.ppid);
            expect(contender.data.holderLumpName).toBe('parent');
            expect(await lockFiles()).toHaveLength(1);
        });
    });

    describe('races', () => {
        it('a contender that lists while another is between create and list backs off', async () => {
            const gate = manualGate();
            fsGate.beforeReaddir = async () => {
                fsGate.beforeReaddir = undefined;
                await gate.wait();
            };

            const firstPromise = acquire('first');
            await gate.reached;
            const second = await acquire('second');
            gate.open();
            const first = await firstPromise;

            expect(second.success).toBe(false);
            expect(first.success).toBe(true);
            if (first.success) await first.data();
        });

        it('never grants two holders when both create before either lists', async () => {
            const gates = [manualGate(), manualGate()];
            let calls = 0;
            fsGate.beforeReaddir = async () => {
                const gate = gates[calls++];
                if (gate) await gate.wait();
            };

            const results = [acquire('a'), acquire('b')];
            await Promise.all(gates.map((g) => g.reached));
            for (const g of gates) g.open();
            const settled = await Promise.all(results);

            const winners = settled.filter((r) => r.success);
            expect(winners.length).toBeLessThanOrEqual(1);
            for (const r of winners) if (r.success) await r.data();
        });

        it('a slow cleaner deleting a dead lock by name cannot touch a new holder', async () => {
            const dead = await writeLockFile({ pid: 999_999_999 });
            const gate = manualGate();
            fsGate.beforeUnlink = async (filePath) => {
                if (filePath !== dead) return;
                fsGate.beforeUnlink = undefined;
                await gate.wait();
            };

            const cleaner = removeWorkspaceFileLocksHeldByDeadPid({
                globalConfigFolderPath,
                spec: TEST_LOCK_SPEC,
                pid: 999_999_999,
            });
            await gate.reached;
            const holder = await acquire('holder');
            if (!holder.success) throw new Error('holder should acquire');
            gate.open();
            await cleaner;

            expect(await lockFiles()).toHaveLength(1);
            expect((await acquire('contender')).success).toBe(false);
            await holder.data();
        });

        it('fail mode acquires when the live-looking file was only another attempt that backed off', async () => {
            const startId = (await readProcessStartId(process.ppid)) ?? 'x';
            const attemptFile = await writeLockFile({ pid: process.ppid, startId });
            // The first look sees the other attempt's file; it is gone before the second look.
            let looks = 0;
            fsGate.beforeReaddir = async () => {
                looks += 1;
                if (looks === 2) unlinkSync(attemptFile);
            };

            const acquired = await acquire('manual-run');
            expect(looks).toBeGreaterThanOrEqual(2);
            expect(acquired.success).toBe(true);
            if (acquired.success) await acquired.data();
        });

        it('each wait-mode attempt uses a fresh file name', async () => {
            const holder = await acquire('holder');
            if (!holder.success) throw new Error('holder should acquire');
            const [holderFile] = await lockFiles();
            const waiterFiles = new Set<string>();
            fsGate.beforeReaddir = async () => {
                // readdirSync: the mocked async readdir would re-enter this gate.
                const names = readdirSync(locksDir()).filter((f) => f.endsWith('.lock') && f !== holderFile);
                for (const name of names) waiterFiles.add(name);
            };

            const waiter = acquireWorkspaceFileLock({
                spec: TEST_LOCK_SPEC,
                globalConfigFolderPath,
                workspacePath,
                lumpName: 'waiter',
                mode: 'wait',
            });
            await vi.waitFor(() => expect(waiterFiles.size).toBeGreaterThanOrEqual(2), { timeout: 5_000 });
            fsGate.beforeReaddir = undefined;
            await holder.data();
            const acquired = await waiter;
            if (acquired.success) await acquired.data();
        });

        it.skipIf(process.platform === 'win32')('fails instead of spinning when the lock folder is unusable', async () => {
            await fs.mkdir(locksDir(), { recursive: true });
            await fs.chmod(locksDir(), 0o500);
            try {
                await expect(
                    acquireWorkspaceFileLock({
                        spec: TEST_LOCK_SPEC,
                        globalConfigFolderPath,
                        workspacePath,
                        lumpName: 'blocked',
                        mode: 'wait',
                        waitTimeoutMs: 1_000,
                    }),
                ).rejects.toMatchObject({ code: 'EACCES' });
            } finally {
                await fs.chmod(locksDir(), 0o700);
            }
        });
    });

    describe('v0.10.x legacy lock file', () => {
        it('treats a live legacy holder as busy', async () => {
            await fs.mkdir(locksDir(), { recursive: true });
            await writeJsonFile({
                filePath: legacyPath(),
                data: { pid: process.ppid, lumpName: 'old-daemon', startedAt: new Date().toISOString() },
            });

            const contender = await acquire('new');
            expect(contender.success).toBe(false);
            if (contender.success) throw new Error('unreachable');
            expect(contender.data.holderLumpName).toBe('old-daemon');
            expect(await lockFiles()).toEqual([]);
        });

        it('treats a legacy file with this process pid and no token as stale', async () => {
            await fs.mkdir(locksDir(), { recursive: true });
            await writeJsonFile({
                filePath: legacyPath(),
                data: { pid: process.pid, lumpName: 'old-daemon-that-had-this-pid', startedAt: new Date().toISOString() },
            });

            const acquired = await acquire('new');
            expect(acquired.success).toBe(true);
            if (acquired.success) await acquired.data();
        });

        it('removes a dead legacy holder and acquires', async () => {
            await fs.mkdir(locksDir(), { recursive: true });
            await writeJsonFile({
                filePath: legacyPath(),
                data: { pid: 999_999_999, lumpName: 'ghost', startedAt: new Date().toISOString() },
            });

            const acquired = await acquire('new');
            expect(acquired.success).toBe(true);
            if (acquired.success) await acquired.data();
        });

        it('treats a fresh unreadable legacy file as busy and an old one as stale', async () => {
            await fs.mkdir(locksDir(), { recursive: true });
            await fs.writeFile(legacyPath(), '', 'utf8');
            expect((await acquire('early')).success).toBe(false);

            const old = new Date(Date.now() - 11_000);
            await fs.utimes(legacyPath(), old, old);
            const acquired = await acquire('late');
            expect(acquired.success).toBe(true);
            if (acquired.success) await acquired.data();
        });

        it('holds the legacy file so an old-version wx create fails', async () => {
            const held = await acquire('new');
            if (!held.success) throw new Error('should acquire');

            await expect(fs.writeFile(legacyPath(), '{}', { flag: 'wx' })).rejects.toMatchObject({ code: 'EEXIST' });
            await held.data();
        });
    });
});
