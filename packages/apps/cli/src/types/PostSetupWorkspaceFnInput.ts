import type { ContextList, LumpVariables } from '@lumpcode/core';

import type { WorkspaceStrategy } from './WorkspaceStrategy';

export type PostSetupWorkspaceFnInput<V extends LumpVariables = LumpVariables> = {
    baseBranch: string;
    branchName: string;
    contextList: ContextList;
    /** Branch workspace. Already prepared on a real run. Read-only. */
    workspacePath: string;
    executionWorkspacePath: string;
    workspaceStrategy: WorkspaceStrategy;
    projectRoot: string;
    lumpVariables: V;
};
