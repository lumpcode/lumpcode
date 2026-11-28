import type { ContextList, ContextResult, LumpVariables } from '@lumpcode/core';

import type { WorkspaceStrategy } from './WorkspaceStrategy';

export type PostSetupWorkspaceFnInput<V extends LumpVariables = LumpVariables> = {
    baseBranch: string;
    branchName: string;
    contextList: ContextList;
    /**
     * Setup: []. Teardown: one result per context run on this branch, in run order.
     * `postTeardownWorkspaceCommand` does not receive this.
     */
    contextResults: ContextResult[];
    /** Branch workspace. Already prepared on a real run. Read-only. */
    workspacePath: string;
    executionWorkspacePath: string;
    workspaceStrategy: WorkspaceStrategy;
    projectRoot: string;
    lumpVariables: V;
};
