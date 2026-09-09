import { describe, expect, it } from 'vitest';

import { assertDedicatedDaemonRequired } from './main';

const SHARED_MODE_NO_DAEMON_MESSAGE =
    'lumpcode start is dedicated-only. Use a worker clone with mode: dedicated, or lumpcode run on this laptop.';

describe('assertDedicatedDaemonRequired (shared-in-place-run)', () => {
    it('succeeds in dedicated mode', () => {
        const result = assertDedicatedDaemonRequired({ mode: 'dedicated' });
        expect(result.success).toBe(true);
    });

    it('fails sharedModeNoDaemon in shared mode with the exact message', () => {
        const result = assertDedicatedDaemonRequired({ mode: 'shared' });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.code).toBe('sharedModeNoDaemon');
        expect(result.data.message).toBe(SHARED_MODE_NO_DAEMON_MESSAGE);
    });
});
