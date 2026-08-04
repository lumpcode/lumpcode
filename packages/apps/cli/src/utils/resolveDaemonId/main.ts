import { randomBytes } from 'node:crypto';

import type { Failure, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

export type ResolveDaemonIdInput = {
    explicitDaemonId?: string;
    /** After `--lumpName` merge into include. */
    include?: string[];
    exclude?: string[];
    existingDaemonIds: ReadonlySet<string>;
    /**
     * Optional hex source for multi/glob auto ids (`d-` + 6 lowercase hex).
     * When omitted, implementation uses crypto; tests may inject a sequence.
     */
    randomHex6?: () => string;
};

const DAEMON_ID_CHARSET = /^[a-zA-Z0-9_-]+$/;

function hasFilters(include?: string[], exclude?: string[]): boolean {
    return (
        (include !== undefined && include.length > 0) ||
        (exclude !== undefined && exclude.length > 0)
    );
}

function isSingleExactIncludeOnly(input: {
    include?: string[];
    exclude?: string[];
}): boolean {
    const { include, exclude } = input;
    return (
        include !== undefined &&
        include.length === 1 &&
        !include[0]!.includes('*') &&
        (exclude === undefined || exclude.length === 0)
    );
}

function defaultRandomHex6(): string {
    return randomBytes(3).toString('hex');
}

function allocateRandomId(input: {
    existingDaemonIds: ReadonlySet<string>;
    randomHex6?: () => string;
}): string {
    const nextHex = input.randomHex6 ?? defaultRandomHex6;
    for (let attempt = 0; attempt < 64; attempt += 1) {
        const id = `d-${nextHex()}`;
        if (!input.existingDaemonIds.has(id)) {
            return id;
        }
    }
    return `d-${defaultRandomHex6()}`;
}

function allocateExactNameId(base: string, existingDaemonIds: ReadonlySet<string>): string {
    if (!existingDaemonIds.has(base)) {
        return base;
    }
    let n = 2;
    while (existingDaemonIds.has(`${base}-${n}`)) {
        n += 1;
    }
    return `${base}-${n}`;
}

/**
 * Resolves the daemon id for a `start` according to the daemon-id-and-filters matrix.
 */
export function resolveDaemonId(
    input: ResolveDaemonIdInput,
): Success<string> | Failure<string> {
    const { explicitDaemonId, include, exclude, existingDaemonIds, randomHex6 } = input;
    const filtered = hasFilters(include, exclude);

    if (explicitDaemonId !== undefined) {
        const id = explicitDaemonId.trim();
        if (!DAEMON_ID_CHARSET.test(id)) {
            return failure(
                `Invalid --daemonId "${explicitDaemonId}": must match charset [a-zA-Z0-9_-]+.`,
            );
        }
        if (id === 'global' && filtered) {
            return failure(
                'daemonId "global" is reserved for unfiltered daemons; omit filters or choose another --daemonId.',
            );
        }
        if (existingDaemonIds.has(id)) {
            return failure(`daemonIdInUse: daemon id "${id}" is already in use.`);
        }
        return success(id);
    }

    if (!filtered) {
        return success('global');
    }

    if (isSingleExactIncludeOnly({ include, exclude })) {
        const name = include![0]!;
        if (name === 'global') {
            return failure(
                'Auto daemon id would be reserved "global" under a filter; pass an explicit --daemonId.',
            );
        }
        return success(allocateExactNameId(name, existingDaemonIds));
    }

    return success(allocateRandomId({ existingDaemonIds, randomHex6 }));
}
