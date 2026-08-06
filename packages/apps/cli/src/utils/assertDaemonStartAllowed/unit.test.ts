import { describe, expect, it } from 'vitest';

import { assertDaemonStartAllowed } from './main';

describe('assertDaemonStartAllowed', () => {
    const projectName = 'proj';

    it('allows start when nothing is running', () => {
        const result = assertDaemonStartAllowed({
            projectName,
            daemonId: 'global',
            running: {},
        });
        expect(result.success).toBe(true);
    });

    it('allows overlapping filters with different ids', () => {
        const result = assertDaemonStartAllowed({
            projectName,
            daemonId: 'beta',
            running: {
                alpha: { pid: 101, meta: 'ok', workspaceStrategy: 'checkout' },
            },
        });
        expect(result.success).toBe(true);
    });

    it('blocks when the same daemonId is running', () => {
        const result = assertDaemonStartAllowed({
            projectName,
            daemonId: 'alpha',
            running: {
                alpha: { pid: 102, meta: 'ok', workspaceStrategy: 'worktree' },
            },
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.code).toBe('daemonIdInUse');
        expect(result.data.message).toContain('alpha');
    });

    it('blocks start when a running daemon has missing meta', () => {
        const result = assertDaemonStartAllowed({
            projectName,
            daemonId: 'beta',
            running: { alpha: { pid: 103, meta: 'missing' } },
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.code).toBe('daemonMetaCorrupt');
        expect(result.data.reason).toBe('missing');
        expect(result.data.message).toMatch(/meta is invalid \(reason: missing\)|--force/);
    });

    it('blocks start when a running daemon has invalid meta', () => {
        const result = assertDaemonStartAllowed({
            projectName,
            daemonId: 'global',
            running: { nightly: { pid: 100, meta: 'invalid' } },
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.code).toBe('daemonMetaCorrupt');
        expect(result.data.reason).toBe('invalid');
    });
});
