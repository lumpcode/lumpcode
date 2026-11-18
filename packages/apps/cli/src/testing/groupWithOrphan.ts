import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isProcessAlive } from '@lumpcode/core';

const fixture = fileURLToPath(new URL('./groupWithOrphan.cjs', import.meta.url));

async function sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Starts a detached process group (`groupWithOrphan.cjs`) whose orphan is out
 * of the leader's tree. `leader-stay` stands in for a live daemon,
 * `leader-exit` for a step whose agent already exited.
 */
export async function startGroupWithOrphan(input: {
    dir: string;
    mode: 'leader-stay' | 'leader-exit';
}): Promise<{ leader: number; orphan: number }> {
    const readyFile = path.join(input.dir, `group-${input.mode}-${Date.now()}-${Math.random()}.json`);
    const child = spawn(process.execPath, [fixture, input.mode, readyFile], { detached: true, stdio: 'ignore' });
    child.unref();
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
        try {
            const ready = JSON.parse(await fs.readFile(readyFile, 'utf8')) as { leader: number; orphan: number };
            if (input.mode === 'leader-exit') {
                while (isProcessAlive(ready.leader, { onProbeError: 'dead' })) await sleep(20);
            }
            return ready;
        } catch {
            await sleep(20);
        }
    }
    throw new Error(`timed out waiting for ${readyFile}`);
}

/** Polls until `pid` is gone, or throws after `timeoutMs`. */
export async function waitUntilPidGone(pid: number, timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (isProcessAlive(pid, { onProbeError: 'dead' })) {
        if (Date.now() > deadline) throw new Error(`pid ${pid} still alive`);
        await sleep(20);
    }
}

export function killBestEffort(pids: number[]): void {
    for (const pid of pids) {
        try {
            process.kill(pid, 'SIGKILL');
        } catch {
            // already gone
        }
    }
}
