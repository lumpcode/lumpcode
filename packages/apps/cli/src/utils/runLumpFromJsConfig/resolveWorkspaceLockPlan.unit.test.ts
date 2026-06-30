import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { planNeedsBranchLock, resolveWorkspaceLockPlan } from './resolveWorkspaceLockPlan';

describe('resolveWorkspaceLockPlan', () => {
    const executionPath = '/repo';
    const branchPath = '/repo/.lumpcode/worktrees/lump/foo/bar';

    it('returns none when needsLock is false', () => {
        expect(
            resolveWorkspaceLockPlan({
                needsLock: false,
                mode: 'dedicated',
                workspaceStrategy: 'checkout',
                executionWorkspacePath: executionPath,
                branchWorkspacePath: executionPath,
            }),
        ).toEqual({ kind: 'none' });
    });

    it('returns shared plan with branch lock only', () => {
        expect(
            resolveWorkspaceLockPlan({
                needsLock: true,
                mode: 'shared',
                workspaceStrategy: 'checkout',
                executionWorkspacePath: executionPath,
                branchWorkspacePath: executionPath,
            }),
        ).toEqual({ kind: 'shared', branchWorkspacePath: executionPath });
    });

    it('returns dedicated-checkout plan for checkout strategy', () => {
        expect(
            resolveWorkspaceLockPlan({
                needsLock: true,
                mode: 'dedicated',
                workspaceStrategy: 'checkout',
                executionWorkspacePath: executionPath,
                branchWorkspacePath: executionPath,
            }),
        ).toEqual({ kind: 'dedicated-checkout', executionWorkspacePath: executionPath });
    });

    it('returns dedicated-worktree plan for worktree strategy', () => {
        expect(
            resolveWorkspaceLockPlan({
                needsLock: true,
                mode: 'dedicated',
                workspaceStrategy: 'worktree',
                executionWorkspacePath: executionPath,
                branchWorkspacePath: branchPath,
            }),
        ).toEqual({
            kind: 'dedicated-worktree',
            executionWorkspacePath: executionPath,
            branchWorkspacePath: branchPath,
        });
    });

    it('normalizes workspace paths', () => {
        const plan = resolveWorkspaceLockPlan({
            needsLock: true,
            mode: 'dedicated',
            workspaceStrategy: 'worktree',
            executionWorkspacePath: path.join('/repo', '.'),
            branchWorkspacePath: path.join('/repo', '.lumpcode', 'worktrees', 'x'),
        });
        expect(plan).toMatchObject({
            kind: 'dedicated-worktree',
            executionWorkspacePath: path.resolve('/repo'),
            branchWorkspacePath: path.resolve('/repo', '.lumpcode', 'worktrees', 'x'),
        });
    });

    it('planNeedsBranchLock is false for dedicated-checkout (same path)', () => {
        const plan = resolveWorkspaceLockPlan({
            needsLock: true,
            mode: 'dedicated',
            workspaceStrategy: 'checkout',
            executionWorkspacePath: executionPath,
            branchWorkspacePath: executionPath,
        });
        expect(planNeedsBranchLock(plan)).toBe(false);
    });

    it('planNeedsBranchLock is true for shared and dedicated-worktree', () => {
        expect(
            planNeedsBranchLock(
                resolveWorkspaceLockPlan({
                    needsLock: true,
                    mode: 'shared',
                    workspaceStrategy: 'checkout',
                    executionWorkspacePath: executionPath,
                    branchWorkspacePath: executionPath,
                }),
            ),
        ).toBe(true);
        expect(
            planNeedsBranchLock(
                resolveWorkspaceLockPlan({
                    needsLock: true,
                    mode: 'dedicated',
                    workspaceStrategy: 'worktree',
                    executionWorkspacePath: executionPath,
                    branchWorkspacePath: branchPath,
                }),
            ),
        ).toBe(true);
    });
});
