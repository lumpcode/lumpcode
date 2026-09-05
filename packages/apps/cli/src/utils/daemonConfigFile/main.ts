import { createHash } from 'node:crypto';

import * as z from 'zod';

import { DEFAULT_DAEMON_CRON_SETUP } from '../../consts';
import { isGitRefGlob } from '../isGitRefGlob';

/** Repo recipe under `.lumpcode/daemons/<daemonId>.{json,yml,yaml}` (id is the stem). */
export const daemonConfigFileSchema = z
    .object({
        discoveryBranch: z
            .string()
            .min(1)
            .refine((value) => !isGitRefGlob(value), {
                message: 'discoveryBranch must be an exact branch name (no * or ?)',
            }),
        cronSetup: z.string().min(1).optional(),
        include: z.array(z.string()).optional(),
        exclude: z.array(z.string()).optional(),
        disabled: z.boolean().optional(),
        maxParallelRun: z.number().int().positive().optional(),
    })
    .strict();

export type DaemonConfigFile = z.infer<typeof daemonConfigFileSchema>;

/** Canonical shape hashed for restart detection (not file bytes). */
export type NormalizedDaemonConfigFile = {
    discoveryBranch: string;
    cronSetup: string;
    disabled: boolean;
    include?: string[];
    exclude?: string[];
    maxParallelRun?: number;
};

/** Meta marker that a running daemon was launched from a repo recipe file. */
export type DaemonConfigFileMeta = {
    hash: string;
    discoveryBranch: string;
    /** Repo-root-relative POSIX path, e.g. `.lumpcode/daemons/nightly.json`. */
    path: string;
};

function sortCopy(values: string[]): string[] {
    return [...values].sort();
}

/** Apply defaults and canonical include/exclude ordering for hashing. */
export function normalizeDaemonConfigFile(parsed: DaemonConfigFile): NormalizedDaemonConfigFile {
    const normalized: NormalizedDaemonConfigFile = {
        discoveryBranch: parsed.discoveryBranch,
        cronSetup: parsed.cronSetup ?? DEFAULT_DAEMON_CRON_SETUP,
        disabled: parsed.disabled ?? false,
    };
    if (parsed.include !== undefined && parsed.include.length > 0) {
        normalized.include = sortCopy(parsed.include);
    }
    if (parsed.exclude !== undefined && parsed.exclude.length > 0) {
        normalized.exclude = sortCopy(parsed.exclude);
    }
    if (parsed.maxParallelRun !== undefined) {
        normalized.maxParallelRun = parsed.maxParallelRun;
    }
    return normalized;
}

function stringifyNormalizedSortedKeys(normalized: NormalizedDaemonConfigFile): string {
    const ordered: Record<string, unknown> = {};
    for (const key of Object.keys(normalized).sort()) {
        ordered[key] = normalized[key as keyof NormalizedDaemonConfigFile];
    }
    return JSON.stringify(ordered);
}

/** SHA-256 hex of the normalized config with sorted object keys. */
export function hashDaemonConfigFile(parsed: DaemonConfigFile): string {
    return createHash('sha256')
        .update(stringifyNormalizedSortedKeys(normalizeDaemonConfigFile(parsed)))
        .digest('hex');
}
