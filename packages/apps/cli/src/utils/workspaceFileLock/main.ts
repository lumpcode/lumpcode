import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { failure, type Failure, success, type Success, type Logger } from '@lumpcode/core';

export type WorkspaceLockMode = 'wait' | 'fail';

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

export type ReleaseWorkspaceFileLockFn = () => Promise<void>;

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

function isProcessAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        const code =
            e && typeof e === 'object' && 'code' in e ? (e as NodeJS.ErrnoException).code : undefined;
        return code !== 'ESRCH';
    }
}

function formatBusyMessage(input: {
    spec: WorkspaceFileLockSpec;
    workspacePath: string;
    holder?: WorkspaceLockHolder;
}): string {
    const { spec, workspacePath, holder } = input;
    if (holder?.lumpName && holder.pid) {
        return (
            `${spec.workspaceLabel} "${workspacePath}" is in use by another lumpcode run ` +
            `(pid ${holder.pid}, lump "${holder.lumpName}"). Wait for it to finish or stop the daemon before running again.`
        );
    }
    if (holder?.pid) {
        return (
            `${spec.workspaceLabel} "${workspacePath}" is in use by another lumpcode run ` +
            `(pid ${holder.pid}). Wait for it to finish or stop the daemon before running again.`
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
    if (holder?.lumpName && holder.pid) {
        return (
            `${spec.waitLogNoun} busy at "${workspacePath}" ` +
            `(held by lump "${holder.lumpName}" pid ${holder.pid}); waiting…`
        );
    }
    return `${spec.waitLogNoun} busy at "${workspacePath}"; waiting…`;
}

async function readLockHolder(lockFilePath: string): Promise<WorkspaceLockHolder | undefined> {
    try {
        const raw = await fs.readFile(lockFilePath, 'utf8');
        const parsed = JSON.parse(raw) as WorkspaceLockHolder;
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
            await handle.writeFile(`${JSON.stringify(payload)}\n`, 'utf8');
        } finally {
            await handle.close();
        }
        return { status: 'acquired' };
    } catch (e) {
        const code =
            e && typeof e === 'object' && 'code' in e ? (e as NodeJS.ErrnoException).code : undefined;
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
}): Promise<
    Success<ReleaseWorkspaceFileLockFn> | Failure<WorkspaceFileBusyError<S>>
> {
    const { spec, globalConfigFolderPath, workspacePath, lumpName, mode, projectName, logger } = input;

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

    for (;;) {
        const attempt = await tryAcquireWorkspaceFileLockOnce({ lockFilePath, payload, spec, logger });

        if (attempt.status === 'acquired') {
            const release: ReleaseWorkspaceFileLockFn = async () => {
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
                code: spec.busyCode,
                message: formatBusyMessage({
                    spec,
                    workspacePath: normalizedWorkspacePath,
                    holder: attempt.holder,
                }),
                [spec.workspacePathField]: normalizedWorkspacePath,
                ...(attempt.holder?.pid !== undefined ? { holderPid: attempt.holder.pid } : {}),
                ...(attempt.holder?.lumpName !== undefined
                    ? { holderLumpName: attempt.holder.lumpName }
                    : {}),
            } as WorkspaceFileBusyError<S>);
        }

        if (!loggedWait) {
            logger?.info(
                formatWorkspaceFileWaitMessage({
                    spec,
                    workspacePath: normalizedWorkspacePath,
                    holder: attempt.holder,
                }),
            );
            loggedWait = true;
        }

        await new Promise((resolve) => setTimeout(resolve, WAIT_POLL_MS));
    }
}
