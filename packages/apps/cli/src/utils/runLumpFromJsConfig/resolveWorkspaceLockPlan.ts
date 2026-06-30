import * as path from 'node:path';

import type { Mode } from '../../types/Mode';
import type { WorkspaceStrategy } from '../../types/WorkspaceStrategy';

export type WorkspaceLockPlan =
    | { kind: 'none' }
    | { kind: 'shared'; branchWorkspacePath: string }
    /** Branch lock skipped: execution and branch workspaces are the same path. */
    | { kind: 'dedicated-checkout'; executionWorkspacePath: string }
    | { kind: 'dedicated-worktree'; executionWorkspacePath: string; branchWorkspacePath: string };

export function planNeedsBranchLock(
    plan: WorkspaceLockPlan,
): plan is Extract<WorkspaceLockPlan, { kind: 'shared' } | { kind: 'dedicated-worktree' }> {
    return plan.kind === 'shared' || plan.kind === 'dedicated-worktree';
}

export function resolveWorkspaceLockPlan(input: {
    needsLock: boolean;
    mode: Mode;
    workspaceStrategy: WorkspaceStrategy;
    executionWorkspacePath: string;
    branchWorkspacePath: string;
}): WorkspaceLockPlan {
    if (!input.needsLock) {
        return { kind: 'none' };
    }

    const executionWorkspacePath = path.resolve(input.executionWorkspacePath);
    const branchWorkspacePath = path.resolve(input.branchWorkspacePath);

    if (input.mode === 'shared') {
        return { kind: 'shared', branchWorkspacePath };
    }

    if (input.workspaceStrategy === 'worktree') {
        return {
            kind: 'dedicated-worktree',
            executionWorkspacePath,
            branchWorkspacePath,
        };
    }

    return { kind: 'dedicated-checkout', executionWorkspacePath };
}
