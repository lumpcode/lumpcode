import { describe, expect, it } from 'vitest';

import { assertDaemonStartAllowed } from './main';
import type { RunningDaemonInfo } from '../listRunningProjectDaemons';

describe('assertDaemonStartAllowed', () => {
    const projectName = 'proj';
    const files = {
        pidFilePath: '/p',
        metaFilePath: '/m',
        logFilePath: '/l',
        desiredFilePath: '/d',
    };

    function runningOk(pid: number): RunningDaemonInfo {
        return {
            ...files,
            pid,
            meta: { workspaceStrategy: 'checkout' },
        };
    }

    function runningBad(pid: number, metaStatus: 'missing' | 'invalid'): RunningDaemonInfo {
        return { ...files, pid, metaStatus };
    }

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
                alpha: runningOk(101),
            },
        });
        expect(result.success).toBe(true);
    });

    it('blocks when the same daemonId is running', () => {
        const result = assertDaemonStartAllowed({
            projectName,
            daemonId: 'alpha',
            running: {
                alpha: { ...runningOk(102), meta: { workspaceStrategy: 'worktree' } },
            },
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.code).toBe('daemonIdInUse');
        expect(result.data.message).toContain('alpha');
    });

    it('allows start when the live pid is this process', () => {
        const result = assertDaemonStartAllowed({
            projectName,
            daemonId: 'global',
            selfPid: 42,
            running: {
                global: runningBad(42, 'missing'),
            },
        });
        expect(result.success).toBe(true);
    });

    it('blocks start when a running daemon has missing meta', () => {
        const result = assertDaemonStartAllowed({
            projectName,
            daemonId: 'beta',
            running: { alpha: runningBad(103, 'missing') },
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
            running: { nightly: runningBad(100, 'invalid') },
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.code).toBe('daemonMetaCorrupt');
        expect(result.data.reason).toBe('invalid');
    });
});
