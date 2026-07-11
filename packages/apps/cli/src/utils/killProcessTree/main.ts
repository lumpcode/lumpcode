import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { failure, success, type Failure, type Success } from '@lumpcode/core';

import { isProcessAlive } from '../isProcessAlive';
import { nodeErrnoCode } from '../nodeErrnoCode';

const execFileAsync = promisify(execFile);

async function listUnixProcessTreePids(rootPid: number): Promise<number[]> {
    const { stdout } = await execFileAsync('ps', ['-eo', 'pid=,ppid=']);
    const childrenByParent = new Map<number, number[]>();

    for (const line of stdout.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = trimmed.split(/\s+/);
        if (parts.length < 2) continue;
        const pid = Number.parseInt(parts[0] ?? '', 10);
        const ppid = Number.parseInt(parts[1] ?? '', 10);
        if (Number.isNaN(pid) || Number.isNaN(ppid)) continue;
        const siblings = childrenByParent.get(ppid) ?? [];
        siblings.push(pid);
        childrenByParent.set(ppid, siblings);
    }

    const ordered: number[] = [];
    const queue = [rootPid];
    while (queue.length > 0) {
        const pid = queue.shift();
        if (pid === undefined) break;
        ordered.push(pid);
        const children = childrenByParent.get(pid) ?? [];
        for (const childPid of children) {
            queue.push(childPid);
        }
    }

    return ordered;
}

function killPidSigkill(pid: number): void {
    try {
        process.kill(pid, 'SIGKILL');
    } catch (error: unknown) {
        const code = nodeErrnoCode(error);
        if (code !== 'ESRCH') {
            throw error;
        }
    }
}

async function killUnixProcessTree(rootPid: number): Promise<void> {
    const pids = await listUnixProcessTreePids(rootPid);
    for (let index = pids.length - 1; index >= 0; index -= 1) {
        killPidSigkill(pids[index]!);
    }
}

async function killWindowsProcessTree(rootPid: number): Promise<void> {
    try {
        await execFileAsync('taskkill', ['/PID', String(rootPid), '/T', '/F'], {
            windowsHide: true,
        });
    } catch (error: unknown) {
        const stderr =
            error && typeof error === 'object' && 'stderr' in error
                ? String((error as { stderr?: unknown }).stderr ?? '')
                : '';
        const message = error instanceof Error ? error.message : String(error);
        const combined = `${message}\n${stderr}`;
        if (/not found|no running instance|ne existe pas|introuvable/i.test(combined)) {
            return;
        }
        // taskkill can fail to terminate some descendants while the root exits (SEA/agent trees).
        if (!isProcessAlive(rootPid)) {
            return;
        }
        throw error;
    }
}

export async function killProcessTree(input: {
    pid: number;
}): Promise<Success<void> | Failure<string>> {
    const { pid } = input;
    if (!Number.isInteger(pid) || pid <= 0) {
        return failure(`Invalid pid: ${pid}`);
    }

    try {
        if (process.platform === 'win32') {
            await killWindowsProcessTree(pid);
        } else {
            await killUnixProcessTree(pid);
        }
        return success(undefined);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return failure(`Could not kill process tree for pid ${pid}: ${message}`);
    }
}
