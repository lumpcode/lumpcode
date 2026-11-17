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

/**
 * Like `probeAlive`, but a zombie counts as gone: its reaper may not have
 * collected it yet even though it no longer runs. Linux only.
 */
export async function isRunning(pid: number): Promise<boolean> {
    try {
        const stat = await fs.readFile(`/proc/${pid}/stat`, 'utf8');
        const state = stat.slice(stat.lastIndexOf(')') + 2, stat.lastIndexOf(')') + 3);
        return state !== 'Z' && state !== 'X';
    } catch {
        return false;
    }
}

/**
 * `sh -c` command that starts a busy-looping node from a subshell, writes its
 * pid to `readyFile` (`waitForReadyFile` contract), then runs `tail`. The
 * subshell exits first, so the node is already reparented out of the process
 * tree while `tail` runs.
 */
export function orphanLeavingShellArgs(input: { readyFile: string; tail: string }): string[] {
    const { readyFile, tail } = input;
    return [
        '-c',
        `('${process.execPath}' -e 'while(true){}' & echo "{\\"pids\\":[$!]}" > '${readyFile}'); ${tail}`,
    ];
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
 *
 * Default 10s: under parallel vitest load, Node fixture spawn can exceed a
 * tighter wait before the child writes the file (see execBinary E4/E5).
 */
export async function waitForReadyFile(
    readyFile: string,
    timeoutMs = 10_000,
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
