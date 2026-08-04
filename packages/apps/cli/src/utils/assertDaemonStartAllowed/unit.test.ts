import { describe, expect, it } from 'vitest';

import { assertDaemonStartAllowed } from './main';
import type { RunningDaemonInfo } from '../listRunningProjectDaemons';

type AssertInput = {
    projectName: string;
    daemonId: string;
    running: ReadonlyMap<string, RunningDaemonInfo> | Record<string, RunningDaemonInfo>;
};

type AssertResult =
    | { success: true; data: void }
    | {
          success: false;
          data: { message: string; code?: 'daemonIdInUse' | 'daemonMetaCorrupt' };
      };

type AssertFn = (input: AssertInput) => AssertResult;

/**
 * daemon-id-and-filters A1–A5.
 * Skipped until assertDaemonStartAllowed is id-only + corrupt meta.
 * Old global/per-lump/checkout mutual-exclusion cases are deleted (A6).
 */
describe.skip('assertDaemonStartAllowed (daemon-id-and-filters A*)', () => {
    const projectName = 'proj';
    const assert = assertDaemonStartAllowed as unknown as AssertFn;

    function runningRecord(
        entries: Record<string, RunningDaemonInfo>,
    ): Record<string, RunningDaemonInfo> {
        return entries;
    }

    it('A1: free id → success', () => {
        const result = assert({
            projectName,
            daemonId: 'agents',
            running: runningRecord({}),
        });
        expect(result.success).toBe(true);
    });

    it('A2: id in use → daemonIdInUse', () => {
        const result = assert({
            projectName,
            daemonId: 'agents',
            running: runningRecord({
                agents: { pid: 100, meta: 'ok', workspaceStrategy: 'worktree' },
            }),
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.code).toBe('daemonIdInUse');
        expect(result.data.message).toMatch(/agents|already|in use/i);
    });

    it('A3: peer corrupt meta blocks any new start', () => {
        const result = assert({
            projectName,
            daemonId: 'other',
            running: runningRecord({
                agents: { pid: 100, meta: 'missing' },
            }),
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.code).toBe('daemonMetaCorrupt');
    });

    it('A4: overlapping filters allowed (assert only sees ids)', () => {
        const result = assert({
            projectName,
            daemonId: 'other',
            running: runningRecord({
                agents: { pid: 100, meta: 'ok', workspaceStrategy: 'worktree' },
            }),
        });
        expect(result.success).toBe(true);
    });

    it('A5: checkout multi allowed (distinct ids)', () => {
        const result = assert({
            projectName,
            daemonId: 'beta',
            running: runningRecord({
                alpha: { pid: 100, meta: 'ok', workspaceStrategy: 'checkout' },
            }),
        });
        expect(result.success).toBe(true);
    });
});
