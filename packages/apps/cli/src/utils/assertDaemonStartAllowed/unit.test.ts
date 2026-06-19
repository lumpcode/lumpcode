import { describe, expect, it } from 'vitest';

import { assertDaemonStartAllowed } from './main';

describe('assertDaemonStartAllowed', () => {
    const projectName = 'proj';

    it('allows global start when nothing is running', () => {
        const result = assertDaemonStartAllowed({
            projectName,
            workspaceStrategy: 'checkout',
            running: { lumps: {} },
        });
        expect(result.success).toBe(true);
    });

    it('blocks global start when global daemon is running', () => {
        const result = assertDaemonStartAllowed({
            projectName,
            workspaceStrategy: 'checkout',
            running: { global: { pid: 100, workspaceStrategy: 'checkout' }, lumps: {} },
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toContain('global daemon already running');
    });

    it('blocks global start when any per-lump daemon is running', () => {
        const result = assertDaemonStartAllowed({
            projectName,
            workspaceStrategy: 'checkout',
            running: { lumps: { alpha: { pid: 101, workspaceStrategy: 'checkout' } } },
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toContain('per-lump daemon already running');
    });

    it('blocks per-lump start when global daemon is running', () => {
        const result = assertDaemonStartAllowed({
            projectName,
            targetLumpName: 'alpha',
            workspaceStrategy: 'checkout',
            running: { global: { pid: 100, workspaceStrategy: 'checkout' }, lumps: {} },
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toContain('global daemon already running');
    });

    it('blocks per-lump start when same lump daemon is running', () => {
        const result = assertDaemonStartAllowed({
            projectName,
            targetLumpName: 'alpha',
            workspaceStrategy: 'checkout',
            running: { lumps: { alpha: { pid: 102, workspaceStrategy: 'checkout' } } },
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toContain('lump "alpha"');
    });

    it('blocks per-lump checkout start when another lump runs', () => {
        const result = assertDaemonStartAllowed({
            projectName,
            targetLumpName: 'beta',
            workspaceStrategy: 'checkout',
            running: { lumps: { alpha: { pid: 103, workspaceStrategy: 'checkout' } } },
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toContain('Only one daemon can run with workspace strategy "checkout"');
    });

    it('blocks per-lump checkout start when another lump runs with worktree strategy', () => {
        const result = assertDaemonStartAllowed({
            projectName,
            targetLumpName: 'beta',
            workspaceStrategy: 'checkout',
            running: { lumps: { alpha: { pid: 103, workspaceStrategy: 'worktree' } } },
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toContain('Only one daemon can run with workspace strategy "checkout"');
    });

    it('allows per-lump worktree start when another lump runs with worktree strategy', () => {
        const result = assertDaemonStartAllowed({
            projectName,
            targetLumpName: 'beta',
            workspaceStrategy: 'worktree',
            running: { lumps: { alpha: { pid: 103, workspaceStrategy: 'worktree' } } },
        });
        expect(result.success).toBe(true);
    });

    it('blocks per-lump worktree start when a checkout lump daemon is running', () => {
        const result = assertDaemonStartAllowed({
            projectName,
            targetLumpName: 'beta',
            workspaceStrategy: 'worktree',
            running: { lumps: { alpha: { pid: 103, workspaceStrategy: 'checkout' } } },
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data).toContain('workspace strategy "checkout"');
        expect(result.data).toContain('strategy "worktree"');
    });
});
