import { failure, success, type Failure, type Success } from '@lumpcode/core';

import type { Mode } from '../../types/Mode';

export type AssertDedicatedDaemonRequiredFailure = {
    code: 'sharedModeNoDaemon';
    message: string;
};

const SHARED_MODE_NO_DAEMON_MESSAGE =
    'lumpcode start is dedicated-only. Use a worker clone with mode: dedicated, or lumpcode run on this laptop.';

/**
 * Shared mode cannot start / restart / superviseOnly a daemon.
 * Not part of assertDaemonStartAllowed (pid/meta only).
 */
export function assertDedicatedDaemonRequired(input: {
    mode: Mode;
}): Success<void> | Failure<AssertDedicatedDaemonRequiredFailure> {
    if (input.mode === 'shared') {
        return failure({
            code: 'sharedModeNoDaemon' as const,
            message: SHARED_MODE_NO_DAEMON_MESSAGE,
        });
    }
    return success(undefined);
}
