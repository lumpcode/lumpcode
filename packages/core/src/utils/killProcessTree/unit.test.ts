import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { waitForPidGone, waitForReadyFile } from '../../testing/processTreeTestHelpers';
import { killProcessTree } from './main';

const processTreeChildScript = fileURLToPath(
    new URL('../../testing/processTreeChild.cjs', import.meta.url),
);
const sigtermIgnorantScript = fileURLToPath(
    new URL('../../testing/sigtermIgnorantTreeChild.cjs', import.meta.url),
);

async function spawnProcessTree(depth: number): Promise<{ rootPid: number; pids: number[] }> {
    const readyFile = path.join(
        await fs.mkdtemp(path.join(os.tmpdir(), 'lump-core-tree-ready-')),
        'ready.json',
    );
    const child = spawn(process.execPath, [processTreeChildScript], {
        detached: true,
        stdio: 'ignore',
        env: {
            ...process.env,
            LUMPCODE_TREE_CHILD_DEPTH: String(depth),
            LUMPCODE_TREE_READY_FILE: readyFile,
        },
    });
    child.unref();

    const rootPid = child.pid;
    if (rootPid === undefined) {
        throw new Error('spawn did not return a pid');
    }

    const { pids } = await waitForReadyFile(readyFile);
    return { rootPid, pids };
}

async function spawnSigtermIgnorantTree(): Promise<{ rootPid: number; pids: number[] }> {
    const readyFile = path.join(
        await fs.mkdtemp(path.join(os.tmpdir(), 'lump-core-sigterm-ready-')),
        'ready.json',
    );
    const child = spawn(process.execPath, [sigtermIgnorantScript], {
        detached: true,
        stdio: 'ignore',
        env: {
            ...process.env,
            LUMPCODE_TREE_READY_FILE: readyFile,
        },
    });
    child.unref();

    const rootPid = child.pid;
    if (rootPid === undefined) {
        throw new Error('spawn did not return a pid');
    }

    const { pids } = await waitForReadyFile(readyFile);
    return { rootPid, pids };
}

/** Skipped until kill-spawned-command-on-timeout-abort implementation lands. */
describe.skip('killProcessTree (K1–K8)', () => {
    const activePids = new Set<number>();

    afterEach(async () => {
        for (const pid of activePids) {
            try {
                process.kill(pid, 'SIGKILL');
            } catch {
                // already gone
            }
        }
        activePids.clear();
    });

    it('K1: kills a single process', async () => {
        const { rootPid, pids } = await spawnProcessTree(0);
        for (const pid of pids) activePids.add(pid);

        const result = await killProcessTree({ pid: rootPid });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');

        for (const pid of pids) {
            await waitForPidGone(pid);
            activePids.delete(pid);
        }
    });

    it('K2: kills a parent and its child', async () => {
        const { rootPid, pids } = await spawnProcessTree(1);
        for (const pid of pids) activePids.add(pid);
        expect(pids.length).toBeGreaterThanOrEqual(2);

        const result = await killProcessTree({ pid: rootPid });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');

        for (const pid of pids) {
            await waitForPidGone(pid);
            activePids.delete(pid);
        }
    });

    it('K3: kills a deep process tree', async () => {
        const { rootPid, pids } = await spawnProcessTree(2);
        for (const pid of pids) activePids.add(pid);
        expect(pids.length).toBeGreaterThanOrEqual(3);

        const result = await killProcessTree({ pid: rootPid });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');

        for (const pid of pids) {
            await waitForPidGone(pid);
            activePids.delete(pid);
        }
    });

    it('K4: is idempotent on an already exited pid', async () => {
        const { rootPid, pids } = await spawnProcessTree(0);
        for (const pid of pids) activePids.add(pid);

        process.kill(rootPid, 'SIGKILL');
        await waitForPidGone(rootPid);
        activePids.delete(rootPid);

        const result = await killProcessTree({ pid: rootPid });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
    });

    it('K5: fails for invalid pid', async () => {
        for (const pid of [0, -1, 1.5]) {
            const result = await killProcessTree({ pid });
            expect(result.success).toBe(false);
            if (result.success) throw new Error('unreachable');
            expect(result.data).toMatch(/invalid pid/i);
        }
    });

    it('K6: graceMs 0 kills immediately without waiting production grace', async () => {
        const { rootPid, pids } = await spawnProcessTree(0);
        for (const pid of pids) activePids.add(pid);

        const started = Date.now();
        const result = await killProcessTree({ pid: rootPid, graceMs: 0 });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
        expect(Date.now() - started).toBeLessThan(2000);

        for (const pid of pids) {
            await waitForPidGone(pid);
            activePids.delete(pid);
        }
    });

    it.skipIf(process.platform === 'win32')(
        'K7: graceMs > 0 with SIGTERM-compliant child succeeds',
        async () => {
            const { rootPid, pids } = await spawnProcessTree(0);
            for (const pid of pids) activePids.add(pid);

            const result = await killProcessTree({ pid: rootPid, graceMs: 200 });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');

            for (const pid of pids) {
                await waitForPidGone(pid);
                activePids.delete(pid);
            }
        },
    );

    it.skipIf(process.platform === 'win32')(
        'K8: graceMs > 0 with SIGTERM-ignorant child eventually SIGKILLs',
        async () => {
            const { rootPid, pids } = await spawnSigtermIgnorantTree();
            for (const pid of pids) activePids.add(pid);

            const result = await killProcessTree({ pid: rootPid, graceMs: 100 });
            expect(result.success).toBe(true);
            if (!result.success) throw new Error('unreachable');

            for (const pid of pids) {
                await waitForPidGone(pid);
                activePids.delete(pid);
            }
        },
    );
});
