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
            running: { global: { pid: 100, meta: 'ok', workspaceStrategy: 'checkout' }, lumps: {} },
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.message).toContain('global daemon already running');
    });

    it('blocks global start when any per-lump daemon is running', () => {
        const result = assertDaemonStartAllowed({
            projectName,
            workspaceStrategy: 'checkout',
            running: { lumps: { alpha: { pid: 101, meta: 'ok', workspaceStrategy: 'checkout' } } },
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.message).toContain('per-lump daemon already running');
    });

    it('blocks per-lump start when global daemon is running', () => {
        const result = assertDaemonStartAllowed({
            projectName,
            targetLumpName: 'alpha',
            workspaceStrategy: 'checkout',
            running: { global: { pid: 100, meta: 'ok', workspaceStrategy: 'checkout' }, lumps: {} },
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.message).toContain('global daemon already running');
    });

    it('blocks per-lump start when same lump daemon is running', () => {
        const result = assertDaemonStartAllowed({
            projectName,
            targetLumpName: 'alpha',
            workspaceStrategy: 'checkout',
            running: { lumps: { alpha: { pid: 102, meta: 'ok', workspaceStrategy: 'checkout' } } },
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.message).toContain('lump "alpha"');
    });

    it('blocks per-lump checkout start when another lump runs', () => {
        const result = assertDaemonStartAllowed({
            projectName,
            targetLumpName: 'beta',
            workspaceStrategy: 'checkout',
            running: { lumps: { alpha: { pid: 103, meta: 'ok', workspaceStrategy: 'checkout' } } },
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.message).toContain('Only one daemon can run with workspace strategy "checkout"');
    });

    it('blocks per-lump checkout start when another lump runs with worktree strategy', () => {
        const result = assertDaemonStartAllowed({
            projectName,
            targetLumpName: 'beta',
            workspaceStrategy: 'checkout',
            running: { lumps: { alpha: { pid: 103, meta: 'ok', workspaceStrategy: 'worktree' } } },
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.message).toContain('Only one daemon can run with workspace strategy "checkout"');
    });

    it('allows per-lump worktree start when another lump runs with worktree strategy', () => {
        const result = assertDaemonStartAllowed({
            projectName,
            targetLumpName: 'beta',
            workspaceStrategy: 'worktree',
            running: { lumps: { alpha: { pid: 103, meta: 'ok', workspaceStrategy: 'worktree' } } },
        });
        expect(result.success).toBe(true);
    });

    it('blocks per-lump worktree start when a checkout lump daemon is running', () => {
        const result = assertDaemonStartAllowed({
            projectName,
            targetLumpName: 'beta',
            workspaceStrategy: 'worktree',
            running: { lumps: { alpha: { pid: 103, meta: 'ok', workspaceStrategy: 'checkout' } } },
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.message).toContain('workspace strategy "checkout"');
        expect(result.data.message).toContain('strategy "worktree"');
    });

    it('blocks start when a running daemon has missing meta', () => {
        const result = assertDaemonStartAllowed({
            projectName,
            targetLumpName: 'beta',
            workspaceStrategy: 'worktree',
            running: { lumps: { alpha: { pid: 103, meta: 'missing' } } },
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.code).toBe('daemonMetaCorrupt');
        expect(result.data.reason).toBe('missing');
        expect(result.data.message).toMatch(/meta is invalid \(reason: missing\)|--force/);
    });

    it('blocks start when a running global daemon has invalid meta', () => {
        const result = assertDaemonStartAllowed({
            projectName,
            workspaceStrategy: 'checkout',
            running: { global: { pid: 100, meta: 'invalid' }, lumps: {} },
        });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.code).toBe('daemonMetaCorrupt');
        expect(result.data.reason).toBe('invalid');
        expect(result.data.message).toMatch(/meta is invalid \(reason: invalid\)|--force/);
    });
});
