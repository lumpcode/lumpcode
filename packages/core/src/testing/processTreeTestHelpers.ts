import * as fs from 'node:fs/promises';

/** Signal-0 probe: true when the pid is still running. */
export function probeAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

async function sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll until `process.kill(pid, 0)` fails, or throw after `timeoutMs`. */
export async function waitForPidGone(pid: number, timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (!probeAlive(pid)) return;
        await sleep(50);
    }
    throw new Error(`Timed out waiting for pid ${pid} to exit`);
}

/**
 * Poll until a ready file contains a non-empty `pids` array.
 * Ready-file contract: JSON `{ "pids": number[] }`.
 */
export async function waitForReadyFile(
    readyFile: string,
    timeoutMs = 5000,
): Promise<{ pids: number[] }> {
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
