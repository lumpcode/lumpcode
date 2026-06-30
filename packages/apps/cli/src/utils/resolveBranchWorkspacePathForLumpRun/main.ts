import * as path from 'node:path';

import {
    failure,
    type Failure,
    getCodeBasePaths,
    getToDoContextList,
    type ContextList,
    type RunLumpInput,
    success,
    type Success,
} from '@lumpcode/core';

import type { WorkspaceStrategy } from '../../types/WorkspaceStrategy';
import { branchWorkspacePath as getBranchWorkspacePath } from '../branchWorkspacePath';

export type ResolveBranchWorkspacePathForLumpRunResult =
    | { needsLock: false; contextListToDo: ContextList }
    | { needsLock: true; branchWorkspacePath: string; contextListToDo: ContextList };

export async function resolveBranchWorkspacePathForLumpRun(input: {
    runLumpInput: RunLumpInput;
    localConfigFolderPath: string;
    executionWorkspacePath: string;
    workspaceStrategy: WorkspaceStrategy;
}): Promise<Success<ResolveBranchWorkspacePathForLumpRunResult> | Failure<string>> {
    const { runLumpInput, localConfigFolderPath, executionWorkspacePath, workspaceStrategy } = input;

    const projectRoot = path.dirname(localConfigFolderPath);
    const lumpVariables = runLumpInput.lumpVariables ?? {};

    const codeBasePathsResult = await getCodeBasePaths({ cwd: projectRoot });
    if (!codeBasePathsResult.success) {
        return failure(codeBasePathsResult.data.message);
    }

    const todoResult = await getToDoContextList({
        getContextListFn: runLumpInput.getContextListFn,
        lumpVariables,
        projectRoot,
        baseBranch: runLumpInput.baseBranch,
        gitCommitMessageFn: runLumpInput.gitCommitMessageFn!,
    });

    if (!todoResult.success) {
        return failure(todoResult.data.message);
    }

    const contextListToDo = todoResult.data;
    const batchContexts = contextListToDo.slice(0, runLumpInput.numberOfContextsPerBranch ?? 1);
    if (batchContexts.length === 0) {
        return success({ needsLock: false as const, contextListToDo });
    }

    const branchName = await runLumpInput.branchFn({
        contextList: batchContexts,
        contextRunStateList: [],
        lumpVariables,
    });

    const branchWorkspacePath = getBranchWorkspacePath({
        executionWorkspacePath,
        workspaceStrategy,
        branchName,
    });

    return success({ needsLock: true, branchWorkspacePath, contextListToDo });
}
