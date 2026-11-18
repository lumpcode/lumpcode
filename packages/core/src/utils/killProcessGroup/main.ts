import type { Failure, Success } from '../../types';
import { failure } from '../failure';
import { nodeErrnoCode } from '../nodeErrnoCode';
import { success } from '../success';

const KILL_WAIT_MS = 5000;
const POLL_MS = 25;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** False once no process is left in the group (`ESRCH`). */
function signalGroup(pgid: number, signal: NodeJS.Signals | 0): boolean {
    try {
        process.kill(-pgid, signal);
        return true;
    } catch (error: unknown) {
        if (nodeErrnoCode(error) === 'ESRCH') return false;
        throw error;
    }
}

async function waitForGroupGone(pgid: number, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (!signalGroup(pgid, 0)) return true;
        await sleep(POLL_MS);
    }
    return !signalGroup(pgid, 0);
}

/**
 * Kills every process in a Unix process group, including members whose
 * parent already exited. `graceMs > 0` sends SIGTERM first, then SIGKILL
 * after the grace window. Not available on Windows.
 */
export async function killProcessGroup(input: {
    pgid: number;
    graceMs?: number;
}): Promise<Success<void> | Failure<string>> {
    const { pgid, graceMs = 0 } = input;
    if (process.platform === 'win32') {
        return failure('Process groups cannot be killed on Windows');
    }
    if (!Number.isInteger(pgid) || pgid <= 1) {
        return failure(`Invalid process group id: ${pgid}`);
    }
    try {
        if (graceMs > 0) {
            if (!signalGroup(pgid, 'SIGTERM')) return success(undefined);
            if (await waitForGroupGone(pgid, graceMs)) return success(undefined);
        }
        if (!signalGroup(pgid, 'SIGKILL')) return success(undefined);
        if (await waitForGroupGone(pgid, KILL_WAIT_MS)) return success(undefined);
        return failure(`Processes in group ${pgid} survived SIGKILL`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return failure(`Could not kill process group ${pgid}: ${message}`);
    }
}
