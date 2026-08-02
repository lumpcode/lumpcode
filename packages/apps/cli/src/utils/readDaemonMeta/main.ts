import * as z from 'zod';

import { failure, success, type Failure, type Success } from '@lumpcode/core';

import { readJsonFile } from '../readJsonFile';

import type { WorkspaceStrategy } from '../../types/WorkspaceStrategy';

const daemonMetaSchema = z.object({
    cronSetup: z.string().optional(),
    lumpName: z.string().optional(),
    workspaceStrategy: z.enum(['checkout', 'worktree']).optional(),
    busy: z.boolean().optional(),
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

/** Fields written when a detached daemon starts. */
export type DaemonMetaWrite = {
    cronSetup: string;
    workspaceStrategy: WorkspaceStrategy;
    lumpName?: string;
};

const defaultMeta: DaemonMeta = { workspaceStrategy: 'checkout' };

/**
 * Reads daemon metadata written at detach time. Missing or invalid files default
 * to `{ workspaceStrategy: 'checkout' }` for backward compatibility.
 */
export async function readDaemonMeta(
    metaFilePath: string,
): Promise<Success<DaemonMeta> | Failure<string>> {
    const readResult = await readJsonFile<unknown>({
        filePath: metaFilePath,
        ifMissing: { defaultValue: defaultMeta },
    });
    if (!readResult.success) {
        return readResult;
    }

    const validated = daemonMetaSchema.safeParse(readResult.data);
    if (!validated.success) {
        return success(defaultMeta);
    }

    return success({
        ...(validated.data.cronSetup !== undefined ? { cronSetup: validated.data.cronSetup } : {}),
        ...(validated.data.lumpName !== undefined ? { lumpName: validated.data.lumpName } : {}),
        ...(validated.data.busy !== undefined ? { busy: validated.data.busy } : {}),
        workspaceStrategy: validated.data.workspaceStrategy ?? 'checkout',
    });
}

export function metaFilePathFromPidFilePath(pidFilePath: string): string {
    return pidFilePath.replace(/\.pid$/, '.meta.json');
}
