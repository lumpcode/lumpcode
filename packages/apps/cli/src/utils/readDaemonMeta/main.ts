import * as z from 'zod';

import { failure, success, type Failure, type Success } from '@lumpcode/core';

import { readJsonFile } from '../readJsonFile';

import type { WorkspaceStrategy } from '../../types/WorkspaceStrategy';

const daemonMetaSchema = z.object({
    cronSetup: z.string().optional(),
    lumpName: z.string().optional(),
    workspaceStrategy: z.enum(['checkout', 'worktree']).optional(),
    busy: z.boolean().optional(),
    inFlightLumpCount: z.number().int().nonnegative().optional(),
});

export type DaemonMeta = {
    cronSetup?: string;
    lumpName?: string;
    workspaceStrategy: WorkspaceStrategy;
    /** @deprecated Writers use `inFlightLumpCount`; kept for upgrade-safety reads. */
    busy?: boolean;
    /** Number of lump runs currently in flight; `0` when idle. */
    inFlightLumpCount?: number;
};

export type DaemonMetaReadErrorReason = 'missing' | 'invalid' | 'io';

export type DaemonMetaReadError = {
    reason: DaemonMetaReadErrorReason;
    message: string;
};

/** True when the daemon is mid-run (new count or legacy `busy`). */
export function isDaemonMidRun(meta: Pick<DaemonMeta, 'busy' | 'inFlightLumpCount'>): boolean {
    return (meta.inFlightLumpCount ?? 0) >= 1 || meta.busy === true;
}

/** Fields written when a detached daemon starts. */
export type DaemonMetaWrite = {
    cronSetup: string;
    workspaceStrategy: WorkspaceStrategy;
    lumpName?: string;
};

/**
 * Reads daemon metadata written at start time.
 * Missing or invalid files fail closed — callers must not invent strategy/idle state.
 * When a valid meta omits `workspaceStrategy`, defaults that field to `'checkout'` (old writers).
 */
export async function readDaemonMeta(
    metaFilePath: string,
): Promise<Success<DaemonMeta> | Failure<DaemonMetaReadError>> {
    const readResult = await readJsonFile<unknown>({
        filePath: metaFilePath,
        ifMissing: 'fail',
    });
    if (!readResult.success) {
        const message = readResult.data;
        if (/^File not found:/.test(message)) {
            return failure<DaemonMetaReadError>({
                reason: 'missing',
                message: `Daemon meta file not found: ${metaFilePath}`,
            });
        }
        if (/^Invalid JSON in /.test(message)) {
            return failure<DaemonMetaReadError>({
                reason: 'invalid',
                message,
            });
        }
        return failure<DaemonMetaReadError>({
            reason: 'io',
            message,
        });
    }

    const validated = daemonMetaSchema.safeParse(readResult.data);
    if (!validated.success) {
        return failure<DaemonMetaReadError>({
            reason: 'invalid',
            message: `Invalid daemon meta in ${metaFilePath}: ${validated.error.message}`,
        });
    }

    return success({
        ...(validated.data.cronSetup !== undefined ? { cronSetup: validated.data.cronSetup } : {}),
        ...(validated.data.lumpName !== undefined ? { lumpName: validated.data.lumpName } : {}),
        ...(validated.data.busy !== undefined ? { busy: validated.data.busy } : {}),
        ...(validated.data.inFlightLumpCount !== undefined
            ? { inFlightLumpCount: validated.data.inFlightLumpCount }
            : {}),
        workspaceStrategy: validated.data.workspaceStrategy ?? 'checkout',
    });
}

export function metaFilePathFromPidFilePath(pidFilePath: string): string {
    return pidFilePath.replace(/\.pid$/, '.meta.json');
}
