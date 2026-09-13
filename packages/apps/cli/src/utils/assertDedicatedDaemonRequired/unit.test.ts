import { describe, expect, it } from 'vitest';

import {
    SHARED_MODE_NO_DAEMON_MESSAGE,
    assertDedicatedDaemonRequired,
} from './main';

describe('assertDedicatedDaemonRequired (shared-mode-no-daemon)', () => {
    it('fails shared with code sharedModeNoDaemon and the exact message', () => {
        const result = assertDedicatedDaemonRequired({ mode: 'shared' });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.code).toBe('sharedModeNoDaemon');
        expect(result.data.message).toBe(SHARED_MODE_NO_DAEMON_MESSAGE);
    });

    it('succeeds for dedicated', () => {
        const result = assertDedicatedDaemonRequired({ mode: 'dedicated' });

        expect(result.success).toBe(true);
    });
});
