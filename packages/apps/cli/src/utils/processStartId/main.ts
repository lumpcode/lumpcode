import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** `starttime` is field 22 of `/proc/<pid>/stat`; fields are counted from the one after `(comm)`, which is field 3. */
const PROC_STAT_STARTTIME_INDEX = 22 - 3;

async function readLinuxStartId(pid: number): Promise<string | undefined> {
    const raw = await fs.readFile(`/proc/${pid}/stat`, 'utf8');
    const fields = raw.slice(raw.lastIndexOf(')') + 2).split(' ');
    const startTime = fields[PROC_STAT_STARTTIME_INDEX];
    return startTime !== undefined && /^\d+$/.test(startTime) ? startTime : undefined;
}

/** A hung `ps` must not hang every lock acquire; on timeout the caller falls back to pid only. */
const PS_TIMEOUT_MS = 2_000;

async function readDarwinStartId(pid: number): Promise<string | undefined> {
    // `lstart` prints local time without an offset: force UTC so processes with different TZ
    // settings agree, including during the repeated hour when daylight saving ends.
    const { stdout } = await execFileAsync('ps', ['-o', 'lstart=', '-p', String(pid)], {
        env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' },
        timeout: PS_TIMEOUT_MS,
    });
    const startedAtMs = Date.parse(`${stdout.trim()} UTC`);
    return Number.isNaN(startedAtMs) ? undefined : String(Math.floor(startedAtMs / 1000));
}

/**
 * A value that, together with the pid, identifies one process: two processes that reuse the
 * same pid get different start ids. Linux: start time in ticks since boot. macOS: start time in
 * epoch seconds (read in UTC). `undefined` on other platforms, when the pid is not running or
 * unreadable, or when `ps` times out.
 */
export async function readProcessStartId(pid: number): Promise<string | undefined> {
    try {
        if (process.platform === 'linux') return await readLinuxStartId(pid);
        if (process.platform === 'darwin') return await readDarwinStartId(pid);
        return undefined;
    } catch {
        return undefined;
    }
}
