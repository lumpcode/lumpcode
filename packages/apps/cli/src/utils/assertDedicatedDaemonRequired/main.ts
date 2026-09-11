import type { Failure, Success } from '@lumpcode/core';

export const SHARED_MODE_NO_DAEMON_MESSAGE =
    'lumpcode start is dedicated-only. Use a worker clone with mode: dedicated, or lumpcode run on this laptop.';

export type AssertDedicatedDaemonRequiredFailure = {
    code: 'sharedModeNoDaemon';
    message: string;
};

/**
 * Shared-mode gate for start / restart / start --superviseOnly.
 * Not used by stop, daemon-status, daemon-log, or assertDaemonStartAllowed.
 */
export function assertDedicatedDaemonRequired(_input: {
    mode: 'shared' | 'dedicated';
}): Success<void> | Failure<AssertDedicatedDaemonRequiredFailure> {
    throw new Error('not implemented');
}
