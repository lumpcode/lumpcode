import type { Failure, Success } from '@lumpcode/core';
import { failure, success } from '@lumpcode/core';

export const SHARED_MODE_NO_DAEMON_MESSAGE =
    'lumpcode start is dedicated-only. Use a worker clone with mode: dedicated (another copy of the repo on this machine is enough), or lumpcode run on this repo.';

export type AssertDedicatedDaemonRequiredFailure = {
    code: 'sharedModeNoDaemon';
    message: string;
};

/**
 * Shared-mode gate for start / restart / start --superviseOnly.
 * Not used by stop, daemon-status, daemon-log, or assertDaemonStartAllowed.
 */
export function assertDedicatedDaemonRequired(input: {
    mode: 'shared' | 'dedicated';
}): Success<void> | Failure<AssertDedicatedDaemonRequiredFailure> {
    if (input.mode === 'shared') {
        return failure<AssertDedicatedDaemonRequiredFailure>({
            code: 'sharedModeNoDaemon',
            message: SHARED_MODE_NO_DAEMON_MESSAGE,
        });
    }
    return success(undefined);
}
