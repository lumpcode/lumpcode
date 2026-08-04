import type { Failure, Success } from '@lumpcode/core';

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

/**
 * Resolves the daemon id for a `start` according to the daemon-id-and-filters matrix.
 * Stub until implementation.
 */
export function resolveDaemonId(
    _input: ResolveDaemonIdInput,
): Success<string> | Failure<string> {
    throw new Error('not implemented');
}
