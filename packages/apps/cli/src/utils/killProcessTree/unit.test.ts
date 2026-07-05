import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { nodeErrnoCode } from '@lumpcode/core';
import { afterEach, describe, expect, it } from 'vitest';

import { killProcessTree } from './main';

const processTreeChildScript = fileURLToPath(
    new URL('../../testing/processTreeChild.cjs', import.meta.url),
);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForPidGone(pid: number, timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            process.kill(pid, 0);
        } catch (error) {
            const code = nodeErrnoCode(error);
            if (code === 'ESRCH') {
                return;
            }
            throw error;
        }
        await sleep(50);
    }
    throw new Error(`Timed out waiting for pid ${pid} to exit`);
}

async function waitForReadyFile(readyFile: string, timeoutMs = 5000): Promise<{ pids: number[] }> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const raw = await fs.readFile(readyFile, 'utf8');
            const parsed = JSON.parse(raw) as { pids?: number[] };
            if (Array.isArray(parsed.pids) && parsed.pids.length > 0) {
                return { pids: parsed.pids };
            }
        } catch {
            // keep polling
        }
        await sleep(25);
    }
    throw new Error(`Timed out waiting for ready file at ${readyFile}`);
}

async function spawnProcessTree(depth: number): Promise<{ rootPid: number; pids: number[]; readyFile: string }> {
    const readyFile = path.join(
        await fs.mkdtemp(path.join(os.tmpdir(), 'lump-tree-ready-')),
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
    return { rootPid, pids, readyFile };
}

describe('killProcessTree', () => {
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

    it('kills a single process', async () => {
        const { rootPid, pids } = await spawnProcessTree(0);
        for (const pid of pids) {
            activePids.add(pid);
        }

        const result = await killProcessTree({ pid: rootPid });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');

        for (const pid of pids) {
            await waitForPidGone(pid);
            activePids.delete(pid);
        }
    });

    it('kills a parent and its child', async () => {
        const { rootPid, pids } = await spawnProcessTree(1);
        for (const pid of pids) {
            activePids.add(pid);
        }
        expect(pids.length).toBeGreaterThanOrEqual(2);

        const result = await killProcessTree({ pid: rootPid });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');

        for (const pid of pids) {
            await waitForPidGone(pid);
            activePids.delete(pid);
        }
    });

    it('kills a deep process tree', async () => {
        const { rootPid, pids } = await spawnProcessTree(2);
        for (const pid of pids) {
            activePids.add(pid);
        }
        expect(pids.length).toBeGreaterThanOrEqual(3);

        const result = await killProcessTree({ pid: rootPid });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');

        for (const pid of pids) {
            await waitForPidGone(pid);
            activePids.delete(pid);
        }
    });

    it('is idempotent on an already exited pid', async () => {
        const { rootPid, pids } = await spawnProcessTree(0);
        for (const pid of pids) {
            activePids.add(pid);
        }

        process.kill(rootPid, 'SIGKILL');
        await waitForPidGone(rootPid);
        activePids.delete(rootPid);

        const result = await killProcessTree({ pid: rootPid });
        expect(result.success).toBe(true);
        if (!result.success) throw new Error('unreachable');
    });
});
