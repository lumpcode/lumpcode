import type { Failure, Success } from '@lumpcode/core';

import type { Mode } from '../../types/Mode';

export type AssertDedicatedDaemonRequiredFailure = {
    code: 'sharedModeNoDaemon';
    message: string;
};

/**
 * Shared mode cannot start / restart / superviseOnly a daemon.
 * Stub until shared-in-place-run impl. Not part of assertDaemonStartAllowed.
 */
export function assertDedicatedDaemonRequired(_input: {
    mode: Mode;
}): Success<void> | Failure<AssertDedicatedDaemonRequiredFailure> {
    throw new Error('not implemented');
}
