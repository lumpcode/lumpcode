import { describe, expect, it } from 'vitest';

import {
    isRunLumpLockWaitTimeoutFailure,
    type RunLumpFromJsConfigFailure,
} from './failures';

const busy = {
    kind: 'workspacePathBusy' as const,
    code: 'workspacePathBusy' as const,
    message: 'Workspace path is busy',
    workspacePath: '/tmp/workspace',
};

describe('isRunLumpLockWaitTimeoutFailure', () => {
    it('is true only for workspacePathBusy with waitTimedOut', () => {
        const timedOut: RunLumpFromJsConfigFailure = { ...busy, reason: 'waitTimedOut' };
        expect(isRunLumpLockWaitTimeoutFailure(timedOut)).toBe(true);

        const failMode: RunLumpFromJsConfigFailure = { ...busy };
        expect(isRunLumpLockWaitTimeoutFailure(failMode)).toBe(false);

        const message: RunLumpFromJsConfigFailure = { kind: 'message', message: 'git failed' };
        expect(isRunLumpLockWaitTimeoutFailure(message)).toBe(false);
    });
});
