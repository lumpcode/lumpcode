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

import { readProcessStartId } from '../processStartId';
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

function workspacePathHash(workspacePath: string): string {
    return crypto.createHash('sha256').update(path.resolve(workspacePath)).digest('hex');
}

/**
 * The single-file lock name used before per-acquisition lock files. Held alongside the new lock
 * for one release so v0.10.x processes still see the path as busy; see `claimLegacyLock`.
 */
export function workspaceLegacyLockFilePath(input: {
    globalConfigFolderPath: string;
    workspacePath: string;
    spec: WorkspaceFileLockSpec;
}): string {
    return path.join(
        workspaceLocksDirPath({ globalConfigFolderPath: input.globalConfigFolderPath, spec: input.spec }),
        `${workspacePathHash(input.workspacePath)}.lock.json`,
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

/*
 * Locking protocol. Every attempt creates its own file, `<pathHash>.<pid>.<startId>.<token>.lock`
 * with a fresh token, then lists the folder: it holds the lock only if its file is the only live
 * one for that path; otherwise it deletes its own file and backs off. A file name belongs to
 * exactly one attempt and is never reused, so deleting by name can never remove another holder's
 * lock, and liveness is read from the name, never from content.
 */

const LOCK_FILE_NAME = /^([0-9a-f]{64})\.(\d+)\.([^.]+)\.([^.]+)\.lock$/;
const LEGACY_LOCK_FILE_NAME = /^[0-9a-f]{64}\.lock\.json$/;
/** Start id placeholder when the platform cannot read one (Windows); liveness falls back to pid only. */
const UNKNOWN_START_ID = 'x';
const BACKOFF_JITTER_MS = 250;
/**
 * Fail mode looks this many times before reporting busy: a live-looking file may belong to a
 * contender's attempt that is about to back off, not to a holder.
 */
const FAIL_MODE_ATTEMPTS = 3;
const FAIL_MODE_RETRY_MIN_MS = 20;
const FAIL_MODE_RETRY_JITTER_MS = 60;
/**
 * Start ids are cached this long so a waiting contender does not spawn `ps` on every check
 * (macOS). A cached id is only trusted to confirm liveness; a mismatch is re-read.
 */
const START_ID_CACHE_MS = 1_000;

/**
 * Tokens of acquisitions in flight or held by this process. Daemon lines share one pid, so a
 * same-pid lock file is live only while its token is here. A token is added before its file is
 * created and removed after the file is deleted; the set dies with the process.
 */
const heldTokens = new Set<string>();

let ownStartIdPromise: Promise<string> | undefined;
function ownStartId(): Promise<string> {
    ownStartIdPromise ??= readProcessStartId(process.pid).then((id) => id ?? UNKNOWN_START_ID);
    return ownStartIdPromise;
}

const startIdCache = new Map<number, { startId: string | undefined; readAt: number }>();

async function readStartIdCached(pid: number, input: { fresh: boolean }): Promise<string | undefined> {
    const cached = startIdCache.get(pid);
    if (!input.fresh && cached && Date.now() - cached.readAt < START_ID_CACHE_MS) return cached.startId;
    const startId = await readProcessStartId(pid);
    startIdCache.set(pid, { startId, readAt: Date.now() });
    return startId;
}

type LockOwner = { pid: number; startId: string; token: string };

type OwnerLiveness = { live: true } | { live: false; reason: string };

async function ownerLiveness(owner: LockOwner): Promise<OwnerLiveness> {
    if (owner.pid === process.pid && owner.startId === (await ownStartId())) {
        return heldTokens.has(owner.token)
            ? { live: true }
            : { live: false, reason: `pid ${owner.pid} no longer holds it` };
    }
    if (!isProcessAlive(owner.pid, { onProbeError: 'alive' })) {
        return { live: false, reason: `pid ${owner.pid} is not running` };
    }
    if (owner.startId === UNKNOWN_START_ID) {
        return { live: true };
    }
    // A cached id may belong to a process that died and whose pid was reused within the cache
    // window, so a mismatch is confirmed with a fresh read before the owner is called stale.
    const cachedStartId = await readStartIdCached(owner.pid, { fresh: false });
    const currentStartId =
        cachedStartId === undefined || cachedStartId === owner.startId
            ? cachedStartId
            : await readStartIdCached(owner.pid, { fresh: true });
    if (currentStartId !== undefined && currentStartId !== owner.startId) {
        return { live: false, reason: `pid ${owner.pid} now belongs to another process` };
    }
    return { live: true };
}

function parseLockFileName(fileName: string): (LockOwner & { pathHash: string }) | undefined {
    const match = LOCK_FILE_NAME.exec(fileName);
    if (!match) return undefined;
    const [, pathHash, pidRaw, startId, token] = match as unknown as [string, string, string, string, string];
    return { pathHash, pid: Number(pidRaw), startId, token };
}

function parseLockHolder(raw: string): WorkspaceLockHolder | undefined {
    try {
        const parsed = JSON.parse(raw) as WorkspaceLockHolder;
        if (typeof parsed?.pid !== 'number' || Number.isNaN(parsed.pid)) {
            return undefined;
        }
        return parsed;
    } catch {
        return undefined;
    }
}

/** Holder details for busy and wait messages only; the pid comes from the file name. */
async function readHolderForMessages(filePath: string, pid: number): Promise<WorkspaceLockHolder> {
    const raw = await fs.readFile(filePath, 'utf8').catch(() => '');
    return { ...parseLockHolder(raw), pid } as WorkspaceLockHolder;
}

/**
 * Returns a live holder of the path other than `ownFileName`, deleting dead lock files by name
 * on the way. `undefined` when the caller's file is the only live one.
 */
async function findOtherLiveHolder(input: {
    locksDir: string;
    pathHash: string;
    ownFileName: string;
    spec: WorkspaceFileLockSpec;
    logger?: Logger;
}): Promise<{ holder: WorkspaceLockHolder } | undefined> {
    const { locksDir, pathHash, ownFileName, spec, logger } = input;
    for (const fileName of await fs.readdir(locksDir)) {
        const owner = parseLockFileName(fileName);
        if (!owner || owner.pathHash !== pathHash || fileName === ownFileName) continue;
        const filePath = path.join(locksDir, fileName);
        const liveness = await ownerLiveness(owner);
        if (liveness.live) {
            return { holder: await readHolderForMessages(filePath, owner.pid) };
        }
        logger?.warn(`Removing stale ${spec.staleLogNoun} at "${filePath}" (${liveness.reason})`);
        await fs.unlink(filePath).catch(() => {});
    }
    return undefined;
}

// --- Legacy single-file lock, kept for one release (ticket drop-legacy-lock-json) ---

/** An unreadable legacy file younger than this may be a v0.10.x process mid-write. */
const LEGACY_UNREADABLE_GRACE_MS = 10_000;

type LegacyLockState =
    | { state: 'absent' }
    | { state: 'live'; holder?: WorkspaceLockHolder }
    | { state: 'stale'; holder?: WorkspaceLockHolder; reason: string };

async function readLegacyLockState(legacyPath: string): Promise<LegacyLockState> {
    let raw: string;
    try {
        raw = await fs.readFile(legacyPath, 'utf8');
    } catch (e) {
        if (nodeErrnoCode(e) === 'ENOENT') return { state: 'absent' };
        raw = '';
    }
    const holder = parseLockHolder(raw);
    if (!holder) {
        const stat = await fs.stat(legacyPath).catch(() => undefined);
        const old = stat !== undefined && Date.now() - stat.mtimeMs >= LEGACY_UNREADABLE_GRACE_MS;
        return old ? { state: 'stale', reason: 'holder unreadable' } : { state: 'live' };
    }
    if (holder.pid === process.pid && typeof holder.token !== 'string') {
        // A v0.10.x file whose pid this process now has: this process never wrote it.
        return { state: 'stale', holder, reason: `pid ${holder.pid} no longer holds it` };
    }
    const liveness = await ownerLiveness({
        pid: holder.pid,
        startId: typeof holder.startId === 'string' ? holder.startId : UNKNOWN_START_ID,
        token: typeof holder.token === 'string' ? holder.token : '',
    });
    return liveness.live ? { state: 'live', holder } : { state: 'stale', holder, reason: liveness.reason };
}

/**
 * Called once the caller is the only live holder. Also holds `<pathHash>.lock.json` so v0.10.x
 * processes, which only know that file, see the path as busy. New-protocol processes only touch
 * it while they are the sole holder, so they never race each other on it.
 */
async function claimLegacyLock(input: {
    legacyPath: string;
    content: string;
    spec: WorkspaceFileLockSpec;
    logger?: Logger;
}): Promise<{ claimed: true } | { claimed: false; holder?: WorkspaceLockHolder }> {
    const { legacyPath, content, spec, logger } = input;
    for (let attempt = 0; attempt < 2; attempt++) {
        if (await createLegacyLockFile({ legacyPath, content })) {
            return { claimed: true };
        }
        const legacy = await readLegacyLockState(legacyPath);
        if (legacy.state === 'live') return { claimed: false, holder: legacy.holder };
        if (legacy.state === 'stale') {
            logger?.warn(`Removing stale ${spec.staleLogNoun} at "${legacyPath}" (${legacy.reason})`);
            await fs.unlink(legacyPath).catch(() => {});
        }
    }
    return { claimed: false };
}

const LINK_UNSUPPORTED = new Set(['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV']);

/**
 * Creates the legacy file with its content already in it (temp file + `link`), because a v0.10.x
 * reader that sees an empty legacy file deletes it as stale. Falls back to a plain `wx` create on
 * filesystems without hard links. Returns false when the file already exists.
 */
async function createLegacyLockFile(input: { legacyPath: string; content: string }): Promise<boolean> {
    const { legacyPath, content } = input;
    const tempPath = `${legacyPath}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(tempPath, content, 'utf8');
    try {
        await fs.link(tempPath, legacyPath);
        return true;
    } catch (e) {
        const code = nodeErrnoCode(e);
        if (code === 'EEXIST') return false;
        if (code === undefined || !LINK_UNSUPPORTED.has(code)) throw e;
    } finally {
        await fs.unlink(tempPath).catch(() => {});
    }
    try {
        await fs.writeFile(legacyPath, content, { encoding: 'utf8', flag: 'wx' });
        return true;
    } catch (e) {
        if (nodeErrnoCode(e) === 'EEXIST') return false;
        throw e;
    }
}

function releaseLegacyLockSync(legacyPath: string, token: string): void {
    try {
        if (parseLockHolder(fsSync.readFileSync(legacyPath, 'utf8'))?.token === token) {
            fsSync.unlinkSync(legacyPath);
        }
    } catch {
        // already gone or unreadable
    }
}

async function releaseLegacyLock(legacyPath: string, token: string): Promise<void> {
    const raw = await fs.readFile(legacyPath, 'utf8').catch(() => '');
    if (parseLockHolder(raw)?.token === token) {
        await fs.unlink(legacyPath).catch(() => {});
    }
}

// --- End legacy ---

type TryAcquireResult = { status: 'acquired' } | { status: 'busy'; holder?: WorkspaceLockHolder };

async function tryAcquireWorkspaceFileLockOnce(input: {
    locksDir: string;
    pathHash: string;
    ownFileName: string;
    legacyPath: string;
    payload: WorkspaceLockHolder & { token: string };
    spec: WorkspaceFileLockSpec;
    logger?: Logger;
}): Promise<TryAcquireResult> {
    const { locksDir, pathHash, ownFileName, legacyPath, payload, spec, logger } = input;
    const ownPath = path.join(locksDir, ownFileName);
    const content = formatJsonFileContent({ data: payload, trailingNewline: true });

    heldTokens.add(payload.token);
    let acquired = false;
    try {
        await fs.writeFile(ownPath, content, { encoding: 'utf8', flag: 'wx' });
        const other = await findOtherLiveHolder({ locksDir, pathHash, ownFileName, spec, logger });
        if (other) {
            return { status: 'busy', holder: other.holder };
        }
        const legacy = await claimLegacyLock({ legacyPath, content, spec, logger });
        if (!legacy.claimed) {
            return { status: 'busy', holder: legacy.holder };
        }
        acquired = true;
        return { status: 'acquired' };
    } finally {
        if (!acquired) {
            await fs.unlink(ownPath).catch(() => {});
            heldTokens.delete(payload.token);
        }
    }
}

/**
 * Deletes every lock file in `spec`'s folder whose owner is `pid`, once that owner is no longer
 * live. Called when a daemon is known dead so its lines' locks free at once instead of on the
 * next contender's listing.
 */
export async function removeWorkspaceFileLocksHeldByDeadPid(input: {
    globalConfigFolderPath: string;
    spec: WorkspaceFileLockSpec;
    pid: number;
    logger?: Logger;
}): Promise<void> {
    const { globalConfigFolderPath, spec, pid, logger } = input;
    const locksDir = workspaceLocksDirPath({ globalConfigFolderPath, spec });
    let fileNames: string[];
    try {
        fileNames = await fs.readdir(locksDir);
    } catch {
        return;
    }
    for (const fileName of fileNames) {
        const filePath = path.join(locksDir, fileName);
        const owner = parseLockFileName(fileName);
        if (owner?.pid === pid && !(await ownerLiveness(owner)).live) {
            logger?.info(`Removing ${spec.staleLogNoun} left by pid ${pid} at "${filePath}"`);
            await fs.unlink(filePath).catch(() => {});
            continue;
        }
        if (LEGACY_LOCK_FILE_NAME.test(fileName)) {
            const legacy = await readLegacyLockState(filePath);
            if (legacy.state === 'stale' && legacy.holder?.pid === pid) {
                logger?.info(`Removing ${spec.staleLogNoun} left by pid ${pid} at "${filePath}"`);
                await fs.unlink(filePath).catch(() => {});
            }
        }
    }
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

    const pathHash = workspacePathHash(normalizedWorkspacePath);
    const legacyPath = workspaceLegacyLockFilePath({ globalConfigFolderPath, workspacePath: normalizedWorkspacePath, spec });
    const startId = await ownStartId();
    const startedAt = new Date().toISOString();

    let loggedWait = false;
    let lastWaitLogAt = 0;
    let failModeAttempts = 0;
    const waitStartedAt = Date.now();

    for (;;) {
        // A fresh token, so a fresh file name, per attempt: a name is never reused.
        const token = crypto.randomUUID();
        const ownFileName = `${pathHash}.${process.pid}.${startId}.${token}.lock`;
        const ownPath = path.join(locksDir, ownFileName);
        const payload: WorkspaceLockHolder & { token: string } = {
            pid: process.pid,
            startId,
            token,
            lumpName,
            startedAt,
            [spec.workspacePathField]: normalizedWorkspacePath,
            ...(projectName !== undefined ? { projectName } : {}),
        };
        const attempt = await tryAcquireWorkspaceFileLockOnce({
            locksDir,
            pathHash,
            ownFileName,
            legacyPath,
            payload,
            spec,
            logger,
        });

        if (attempt.status === 'acquired') {
            const releaseAsync = async () => {
                await releaseLegacyLock(legacyPath, token);
                await fs.unlink(ownPath).catch(() => {});
                heldTokens.delete(token);
            };
            const release = Object.assign(releaseAsync, {
                sync: () => {
                    releaseLegacyLockSync(legacyPath, token);
                    try {
                        fsSync.unlinkSync(ownPath);
                    } catch {
                        // already gone
                    }
                    heldTokens.delete(token);
                },
            }) satisfies ReleaseWorkspaceFileLockFn;
            return success(release);
        }

        if (mode === 'fail') {
            // Another contender's file may only be an attempt about to back off; look again
            // briefly before reporting busy.
            if (++failModeAttempts < FAIL_MODE_ATTEMPTS) {
                const delayMs = FAIL_MODE_RETRY_MIN_MS + Math.floor(Math.random() * FAIL_MODE_RETRY_JITTER_MS);
                await new Promise((resolve) => setTimeout(resolve, delayMs));
                continue;
            }
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

        // Jitter so contenders that collided do not retry in lockstep.
        const pollMs = WAIT_POLL_MS + Math.floor(Math.random() * BACKOFF_JITTER_MS);
        const remainingMs = waitTimeoutMs - elapsedMs;
        await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, Math.max(0, remainingMs))));
    }
}
