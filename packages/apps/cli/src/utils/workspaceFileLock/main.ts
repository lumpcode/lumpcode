import * as crypto from 'node:crypto';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
    failure,
    type Failure,
    isProcessAlive,
    nodeErrnoCode,
    success,
    type Success,
    type Logger,
} from '@lumpcode/core';

import { readJsonFile } from '../readJsonFile';
import { formatJsonFileContent } from '../writeJsonFile';

export type WorkspaceLockMode = 'wait' | 'fail';

export type WorkspaceLockWaitTimeoutReason = 'waitTimedOut';

export const WORKSPACE_LOCK_WAIT_TIMEOUT_MS = 15 * 60 * 1000;
export const WORKSPACE_LOCK_WAIT_LOG_INTERVAL_MS = 30_000;

export type WorkspaceFileLockSpec = {
    locksSubdirName: string;
    busyCode: string;
    workspacePathField: string;
    workspaceLabel: string;
    waitLogNoun: string;
    staleLogNoun: string;
};

export type WorkspaceFileBusyError<S extends WorkspaceFileLockSpec> = {
    code: S['busyCode'];
    message: string;
    holderPid?: number;
    holderLumpName?: string;
    reason?: WorkspaceLockWaitTimeoutReason;
} & {
    [K in S['workspacePathField']]: string;
};

export type WorkspaceLockHolder = {
    pid: number;
    lumpName: string;
    startedAt: string;
    projectName?: string;
    [key: string]: string | number | undefined;
};

export type ReleaseWorkspaceFileLockFn = (() => Promise<void>) & {
    /** Best-effort sync unlock for `process.exit` / forced interrupt paths. */
    sync: () => void;
};

const WAIT_POLL_MS = 500;

export function workspaceLocksDirPath(input: {
    globalConfigFolderPath: string;
    spec: WorkspaceFileLockSpec;
}): string {
    return path.join(input.globalConfigFolderPath, input.spec.locksSubdirName);
}

export function workspaceLockFilePath(input: {
    globalConfigFolderPath: string;
    workspacePath: string;
    spec: WorkspaceFileLockSpec;
}): string {
    const normalizedPath = path.resolve(input.workspacePath);
    const hash = crypto.createHash('sha256').update(normalizedPath).digest('hex');
    return path.join(
        workspaceLocksDirPath({ 
            globalConfigFolderPath: input.globalConfigFolderPath, 
            spec: input.spec,
        }),
        `${hash}.lock.json`,
    );
}

export function isWorkspaceFileBusyError(
    data: unknown,
    busyCode: string,
): data is Record<string, unknown> & { code: string; message: string } {
    return (
        typeof data === 'object' &&
        data !== null &&
        'code' in data &&
        (data as { code: string }).code === busyCode
    );
}

function formatHolderClause(
    holder: WorkspaceLockHolder | undefined,
    style: 'busy' | 'held',
): string {
    if (holder?.lumpName && holder.pid) {
        return style === 'busy'
            ? ` (pid ${holder.pid}, lump "${holder.lumpName}")`
            : ` (held by lump "${holder.lumpName}" pid ${holder.pid})`;
    }
    if (holder?.pid) {
        return style === 'busy' ? ` (pid ${holder.pid})` : ` (held by pid ${holder.pid})`;
    }
    return '';
}

function formatBusyMessage(input: {
    spec: WorkspaceFileLockSpec;
    workspacePath: string;
    holder?: WorkspaceLockHolder;
}): string {
    const { spec, workspacePath, holder } = input;
    const clause = formatHolderClause(holder, 'busy');
    if (clause) {
        return (
            `${spec.workspaceLabel} "${workspacePath}" is in use by another lumpcode run` +
            `${clause}. Wait for it to finish or stop the daemon before running again.`
        );
    }
    return (
        `${spec.workspaceLabel} "${workspacePath}" is in use by another lumpcode run. ` +
        `Wait for it to finish or stop the daemon before running again.`
    );
}

export function formatWorkspaceFileWaitMessage(input: {
    spec: WorkspaceFileLockSpec;
    workspacePath: string;
    holder?: WorkspaceLockHolder;
}): string {
    const { spec, workspacePath, holder } = input;
    return (
        `${spec.waitLogNoun} busy at "${workspacePath}"` +
        `${formatHolderClause(holder, 'held')}; waiting…`
    );
}

export function formatWorkspaceFileStillWaitingMessage(input: {
    spec: WorkspaceFileLockSpec;
    workspacePath: string;
    holder?: WorkspaceLockHolder;
    elapsedMs: number;
}): string {
    const { spec, workspacePath, holder, elapsedMs } = input;
    const elapsedSec = Math.max(1, Math.round(elapsedMs / 1000));
    return (
        `${spec.waitLogNoun} busy at "${workspacePath}"` +
        `${formatHolderClause(holder, 'held')}; still waiting (${elapsedSec}s)…`
    );
}

function formatWaitTimeoutMessage(input: {
    spec: WorkspaceFileLockSpec;
    workspacePath: string;
    holder?: WorkspaceLockHolder;
    waitTimeoutMs: number;
}): string {
    const { spec, workspacePath, holder, waitTimeoutMs } = input;
    return (
        `Waited ${waitTimeoutMs}ms for ${spec.waitLogNoun} "${workspacePath}"` +
        `${formatHolderClause(holder, 'held')}; giving up.`
    );
}

function toBusyError<S extends WorkspaceFileLockSpec>(input: {
    spec: S;
    workspacePath: string;
    holder?: WorkspaceLockHolder;
    message: string;
    reason?: WorkspaceLockWaitTimeoutReason;
}): WorkspaceFileBusyError<S> {
    const { spec, workspacePath, holder, message, reason } = input;
    return {
        code: spec.busyCode,
        message,
        [spec.workspacePathField]: workspacePath,
        ...(holder?.pid !== undefined ? { holderPid: holder.pid } : {}),
        ...(holder?.lumpName !== undefined ? { holderLumpName: holder.lumpName } : {}),
        ...(reason !== undefined ? { reason } : {}),
    } as WorkspaceFileBusyError<S>;
}

async function readLockHolder(lockFilePath: string): Promise<WorkspaceLockHolder | undefined> {
    const result = await readJsonFile<WorkspaceLockHolder>({ filePath: lockFilePath, ifMissing: 'undefined' });
    if (!result.success || result.data === undefined) {
        return undefined;
    }
    const parsed = result.data;
    if (typeof parsed.pid !== 'number' || Number.isNaN(parsed.pid)) {
        return undefined;
    }
    return parsed;
}

type TryAcquireResult =
    | { status: 'acquired' }
    | { status: 'busy'; holder?: WorkspaceLockHolder }
    | { status: 'stale_removed' };

async function tryAcquireWorkspaceFileLockOnce(input: {
    lockFilePath: string;
    payload: WorkspaceLockHolder;
    spec: WorkspaceFileLockSpec;
    logger?: Logger;
}): Promise<TryAcquireResult> {
    const { lockFilePath, payload, spec, logger } = input;

    try {
        const handle = await fs.open(lockFilePath, 'wx');
        try {
            await handle.writeFile(formatJsonFileContent({ data: payload, trailingNewline: true }), 'utf8');
        } finally {
            await handle.close();
        }
        return { status: 'acquired' };
    } catch (e) {
        const code = nodeErrnoCode(e);
        if (code !== 'EEXIST') {
            throw e;
        }
    }

    const holder = await readLockHolder(lockFilePath);
    if (holder && isProcessAlive(holder.pid, { onProbeError: 'alive' })) {
        return { status: 'busy', holder };
    }

    const stalePid = holder?.pid;
    logger?.warn(
        `Removing stale ${spec.staleLogNoun} at "${lockFilePath}"` +
            (stalePid !== undefined ? ` (pid ${stalePid} is not running)` : ''),
    );
    await fs.unlink(lockFilePath).catch(() => {});
    return { status: 'stale_removed' };
}

export async function acquireWorkspaceFileLock<S extends WorkspaceFileLockSpec>(input: {
    spec: S;
    globalConfigFolderPath: string;
    workspacePath: string;
    lumpName: string;
    mode: WorkspaceLockMode;
    projectName?: string;
    logger?: Logger;
    waitTimeoutMs?: number;
    waitLogIntervalMs?: number;
}): Promise<
    Success<ReleaseWorkspaceFileLockFn> | Failure<WorkspaceFileBusyError<S>>
> {
    const { spec, globalConfigFolderPath, workspacePath, lumpName, mode, projectName, logger } = input;
    const waitTimeoutMs = input.waitTimeoutMs ?? WORKSPACE_LOCK_WAIT_TIMEOUT_MS;
    const waitLogIntervalMs = input.waitLogIntervalMs ?? WORKSPACE_LOCK_WAIT_LOG_INTERVAL_MS;

    const normalizedWorkspacePath = path.resolve(workspacePath);
    const locksDir = workspaceLocksDirPath({ globalConfigFolderPath, spec });
    await fs.mkdir(locksDir, { recursive: true });

    const lockFilePath = workspaceLockFilePath({
        globalConfigFolderPath,
        workspacePath: normalizedWorkspacePath,
        spec,
    });

    const payload: WorkspaceLockHolder = {
        pid: process.pid,
        lumpName,
        startedAt: new Date().toISOString(),
        [spec.workspacePathField]: normalizedWorkspacePath,
        ...(projectName !== undefined ? { projectName } : {}),
    };

    let loggedWait = false;
    let lastWaitLogAt = 0;
    const waitStartedAt = Date.now();

    for (;;) {
        const attempt = await tryAcquireWorkspaceFileLockOnce({ lockFilePath, payload, spec, logger });

        if (attempt.status === 'acquired') {
            const releaseAsync = async () => {
                try {
                    const holder = await readLockHolder(lockFilePath);
                    if (holder?.pid === process.pid) {
                        await fs.unlink(lockFilePath);
                    }
                } catch {
                    // lock already gone
                }
            };
            const release = Object.assign(releaseAsync, {
                sync: () => {
                    try {
                        const raw = fsSync.readFileSync(lockFilePath, 'utf8');
                        const holder = JSON.parse(raw) as WorkspaceLockHolder;
                        if (holder?.pid === process.pid) {
                            fsSync.unlinkSync(lockFilePath);
                        }
                    } catch {
                        // lock already gone or unreadable
                    }
                },
            }) satisfies ReleaseWorkspaceFileLockFn;
            return success(release);
        }

        if (attempt.status === 'stale_removed') {
            loggedWait = false;
            continue;
        }

        if (mode === 'fail') {
            return failure(
                toBusyError({
                    spec,
                    workspacePath: normalizedWorkspacePath,
                    holder: attempt.holder,
                    message: formatBusyMessage({
                        spec,
                        workspacePath: normalizedWorkspacePath,
                        holder: attempt.holder,
                    }),
                }),
            );
        }

        const now = Date.now();
        const elapsedMs = now - waitStartedAt;
        if (elapsedMs >= waitTimeoutMs) {
            return failure(
                toBusyError({
                    spec,
                    workspacePath: normalizedWorkspacePath,
                    holder: attempt.holder,
                    reason: 'waitTimedOut',
                    message: formatWaitTimeoutMessage({
                        spec,
                        workspacePath: normalizedWorkspacePath,
                        holder: attempt.holder,
                        waitTimeoutMs,
                    }),
                }),
            );
        }

        if (!loggedWait || now - lastWaitLogAt >= waitLogIntervalMs) {
            logger?.info(
                loggedWait
                    ? formatWorkspaceFileStillWaitingMessage({
                          spec,
                          workspacePath: normalizedWorkspacePath,
                          holder: attempt.holder,
                          elapsedMs,
                      })
                    : formatWorkspaceFileWaitMessage({
                          spec,
                          workspacePath: normalizedWorkspacePath,
                          holder: attempt.holder,
                      }),
            );
            loggedWait = true;
            lastWaitLogAt = now;
        }

        const remainingMs = waitTimeoutMs - elapsedMs;
        await new Promise((resolve) => setTimeout(resolve, Math.min(WAIT_POLL_MS, Math.max(0, remainingMs))));
    }
}
