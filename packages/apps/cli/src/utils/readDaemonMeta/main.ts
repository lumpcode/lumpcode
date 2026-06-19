import * as fs from 'node:fs/promises';
import * as z from 'zod';

import type { Failure, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

import type { WorkspaceStrategy } from '../../types/WorkspaceStrategy';

const daemonMetaSchema = z.object({
    cronSetup: z.string().optional(),
    lumpName: z.string().optional(),
    workspaceStrategy: z.enum(['checkout', 'worktree']).optional(),
});

export type DaemonMeta = {
    cronSetup?: string;
    lumpName?: string;
    workspaceStrategy: WorkspaceStrategy;
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
    let raw: string;
    try {
        raw = await fs.readFile(metaFilePath, 'utf8');
    } catch (error: unknown) {
        const code =
            error && typeof error === 'object' && 'code' in error  // TODO : we have this pattern everywhere, abstract it
                ? (error as NodeJS.ErrnoException).code
                : undefined;
        if (code === 'ENOENT') {
            return success(defaultMeta);
        }
        return failure(`Cannot read daemon metadata "${metaFilePath}": ${String(error)}`);
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        return failure(`Invalid JSON in daemon metadata "${metaFilePath}": ${String(error)}`);
    }

    const validated = daemonMetaSchema.safeParse(parsed);
    if (!validated.success) {
        return success(defaultMeta);
    }

    return success({
        ...(validated.data.cronSetup !== undefined ? { cronSetup: validated.data.cronSetup } : {}),
        ...(validated.data.lumpName !== undefined ? { lumpName: validated.data.lumpName } : {}),
        workspaceStrategy: validated.data.workspaceStrategy ?? 'checkout',
    });
}

export function metaFilePathFromPidFilePath(pidFilePath: string): string {
    return pidFilePath.replace(/\.pid$/, '.meta.json');
}
