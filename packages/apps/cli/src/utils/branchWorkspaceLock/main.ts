import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { failure, type Failure, success, type Success, type Logger } from '@lumpcode/core';

import { nodeErrorCode } from '../nodeErrorCode';

export type BranchWorkspaceLockMode = 'wait' | 'fail';

export type BranchWorkspaceBusyError = {
    code: 'branchWorkspaceBusy';
    message: string;
    branchWorkspacePath: string;
    holderPid?: number;
    holderLumpName?: string;
};

export type BranchWorkspaceLockHolder = {
    pid: number;
    lumpName: string;
    branchWorkspacePath: string;
    startedAt: string;
    projectName?: string;
};

export type ReleaseBranchWorkspaceLockFn = () => Promise<void>;

const WAIT_POLL_MS = 500;

export function branchWorkspaceLocksDirPath(input: { globalConfigFolderPath: string }): string {
    return path.join(input.globalConfigFolderPath, 'branch-workspace-locks');
}

export function branchWorkspaceLockFilePath(input: {
    globalConfigFolderPath: string;
    branchWorkspacePath: string;
}): string {
    const hash = crypto.createHash('sha256').update(input.branchWorkspacePath).digest('hex');
    return path.join(branchWorkspaceLocksDirPath(input), `${hash}.lock.json`);
}

export function isBranchWorkspaceBusyError(data: unknown): data is BranchWorkspaceBusyError {
    return (
        typeof data === 'object' &&
        data !== null &&
        'code' in data &&
        (data as BranchWorkspaceBusyError).code === 'branchWorkspaceBusy'
    );
}

function isProcessAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        const code = nodeErrorCode(e);
        return code !== 'ESRCH';
    }
}

function formatBusyMessage(input: {
    branchWorkspacePath: string;
    holder?: BranchWorkspaceLockHolder;
}): string {
    const { branchWorkspacePath, holder } = input;
    if (holder) {
        return (
            `Branch workspace "${branchWorkspacePath}" is in use by another lumpcode run ` +
            `(pid ${holder.pid}). Wait for it to finish or stop the daemon before running again.`
        );
    }
    return (
        `Branch workspace "${branchWorkspacePath}" is in use by another lumpcode run. ` +
        `Wait for it to finish or stop the daemon before running again.`
    );
}

export function formatBranchWorkspaceWaitMessage(input: {
    branchWorkspacePath: string;
    holder?: BranchWorkspaceLockHolder;
}): string {
    const { branchWorkspacePath, holder } = input;
    if (holder?.lumpName && holder.pid) {
        return (
            `branch workspace busy at "${branchWorkspacePath}" ` +
            `(held by lump "${holder.lumpName}" pid ${holder.pid}); waiting…`
        );
    }
    return `branch workspace busy at "${branchWorkspacePath}"; waiting…`;
}

async function readLockHolder(lockFilePath: string): Promise<BranchWorkspaceLockHolder | undefined> {
    try {
        const raw = await fs.readFile(lockFilePath, 'utf8');
        const parsed = JSON.parse(raw) as BranchWorkspaceLockHolder;
        if (typeof parsed.pid !== 'number' || Number.isNaN(parsed.pid)) {
            return undefined;
        }
        return parsed;
    } catch {
        return undefined;
    }
}

type TryAcquireResult =
    | { status: 'acquired' }
    | { status: 'busy'; holder?: BranchWorkspaceLockHolder }
    | { status: 'stale_removed' };

async function tryAcquireBranchWorkspaceLockOnce(input: {
    lockFilePath: string;
    payload: BranchWorkspaceLockHolder;
    logger?: Logger;
}): Promise<TryAcquireResult> {
    const { lockFilePath, payload, logger } = input;

    try {
        const handle = await fs.open(lockFilePath, 'wx');
        try {
            await handle.writeFile(`${JSON.stringify(payload)}\n`, 'utf8');
        } finally {
            await handle.close();
        }
        return { status: 'acquired' };
    } catch (e) {
        const code = nodeErrorCode(e);
        if (code !== 'EEXIST') {
            throw e;
        }
    }

    const holder = await readLockHolder(lockFilePath);
    if (holder && isProcessAlive(holder.pid)) {
        return { status: 'busy', holder };
    }

    const stalePid = holder?.pid;
    logger?.warn(
        `Removing stale branch workspace lock at "${lockFilePath}"` +
            (stalePid !== undefined ? ` (pid ${stalePid} is not running)` : ''),
    );
    await fs.unlink(lockFilePath).catch(() => {});
    return { status: 'stale_removed' };
}

export async function acquireBranchWorkspaceLock(input: {
    globalConfigFolderPath: string;
    branchWorkspacePath: string;
    lumpName: string;
    mode: BranchWorkspaceLockMode;
    projectName?: string;
    logger?: Logger;
}): Promise<
    Success<ReleaseBranchWorkspaceLockFn> | Failure<BranchWorkspaceBusyError>
> {
    const {
        globalConfigFolderPath,
        branchWorkspacePath,
        lumpName,
        mode,
        projectName,
        logger,
    } = input;

    const locksDir = branchWorkspaceLocksDirPath({ globalConfigFolderPath });
    await fs.mkdir(locksDir, { recursive: true });

    const lockFilePath = branchWorkspaceLockFilePath({
        globalConfigFolderPath,
        branchWorkspacePath,
    });

    const payload: BranchWorkspaceLockHolder = {
        pid: process.pid,
        lumpName,
        branchWorkspacePath,
        startedAt: new Date().toISOString(),
        ...(projectName !== undefined ? { projectName } : {}),
    };

    let loggedWait = false;

    for (;;) {
        const attempt = await tryAcquireBranchWorkspaceLockOnce({ lockFilePath, payload, logger });

        if (attempt.status === 'acquired') {
            const release: ReleaseBranchWorkspaceLockFn = async () => {
                try {
                    const holder = await readLockHolder(lockFilePath);
                    if (holder?.pid === process.pid) {
                        await fs.unlink(lockFilePath);
                    }
                } catch {
                    // lock already gone
                }
            };
            return success(release);
        }

        if (attempt.status === 'stale_removed') {
            loggedWait = false;
            continue;
        }

        if (mode === 'fail') {
            return failure({
                code: 'branchWorkspaceBusy' as const,
                message: formatBusyMessage({
                    branchWorkspacePath,
                    holder: attempt.holder,
                }),
                branchWorkspacePath,
                ...(attempt.holder?.pid !== undefined ? { holderPid: attempt.holder.pid } : {}),
                ...(attempt.holder?.lumpName !== undefined
                    ? { holderLumpName: attempt.holder.lumpName }
                    : {}),
            });
        }

        if (!loggedWait) {
            logger?.info(
                formatBranchWorkspaceWaitMessage({
                    branchWorkspacePath,
                    holder: attempt.holder,
                }),
            );
            loggedWait = true;
        }

        await new Promise((resolve) => setTimeout(resolve, WAIT_POLL_MS));
    }
}
