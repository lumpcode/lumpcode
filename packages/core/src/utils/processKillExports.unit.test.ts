import { describe, expect, it } from 'vitest';

/**
 * Import-move smoke for kill-spawned-command-on-timeout-abort (M2).
 * Skipped until the three helpers are implemented (not just stubbed) in @lumpcode/core.
 */
describe('core process-kill helper exports (M2)', () => {
    it('M2: killProcessTree, isProcessAlive, and nodeErrnoCode resolve from @lumpcode/core', async () => {
        const core = await import('@lumpcode/core');
        expect(typeof core.killProcessTree).toBe('function');
        expect(typeof core.isProcessAlive).toBe('function');
        expect(typeof core.nodeErrnoCode).toBe('function');

        expect(core.nodeErrnoCode(Object.assign(new Error('x'), { code: 'ENOENT' }))).toBe('ENOENT');
        expect(core.isProcessAlive(process.pid)).toBe(true);
    });
});
