import * as z from 'zod';

import { failure, success, type Failure, type Success } from '@lumpcode/core';

import { readJsonFile } from '../readJsonFile';

import type { WorkspaceStrategy } from '../../types/WorkspaceStrategy';

const daemonMetaSchema = z.object({
    daemonId: z.string().optional(),
    cronSetup: z.string().optional(),
    lumpName: z.string().optional(),
    include: z.array(z.string()).optional(),
    exclude: z.array(z.string()).optional(),
    maxParallelRun: z.number().int().positive().optional(),
    workspaceStrategy: z.enum(['checkout', 'worktree']).optional(),
    busy: z.boolean().optional(),
    inFlightLumpCount: z.number().int().nonnegative().optional(),
});

export type DaemonMeta = {
    daemonId?: string;
    cronSetup?: string;
    /** @deprecated Prefer `include`. Read-only compat. */
    lumpName?: string;
    include?: string[];
    exclude?: string[];
    maxParallelRun?: number;
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

/** Effective include list: explicit include, else legacy lumpName. */
export function daemonMetaInclude(meta: Pick<DaemonMeta, 'include' | 'lumpName'>): string[] | undefined {
    if (meta.include?.length) {
        return meta.include;
    }
    if (meta.lumpName?.trim()) {
        return [meta.lumpName.trim()];
    }
    return undefined;
}

/** Fields written when a daemon starts. */
export type DaemonMetaWrite = {
    daemonId: string;
    cronSetup: string;
    workspaceStrategy: WorkspaceStrategy;
    maxParallelRun?: number;
    include?: string[];
    exclude?: string[];
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

    const data = validated.data;
    return success({
        ...(data.daemonId !== undefined ? { daemonId: data.daemonId } : {}),
        ...(data.cronSetup !== undefined ? { cronSetup: data.cronSetup } : {}),
        ...(data.lumpName !== undefined ? { lumpName: data.lumpName } : {}),
        ...(data.include !== undefined ? { include: data.include } : {}),
        ...(data.exclude !== undefined ? { exclude: data.exclude } : {}),
        ...(data.maxParallelRun !== undefined ? { maxParallelRun: data.maxParallelRun } : {}),
        ...(data.busy !== undefined ? { busy: data.busy } : {}),
        ...(data.inFlightLumpCount !== undefined
            ? { inFlightLumpCount: data.inFlightLumpCount }
            : {}),
        workspaceStrategy: data.workspaceStrategy ?? 'checkout',
    });
}

export function metaFilePathFromPidFilePath(pidFilePath: string): string {
    return pidFilePath.replace(/\.pid$/, '.meta.json');
}
