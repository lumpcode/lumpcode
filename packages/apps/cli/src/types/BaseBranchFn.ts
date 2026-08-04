import type { ContextList, MaybePromise } from '@lumpcode/core';

export type BaseBranchFnInput = {
    effectiveDiscoveryBranch: string;
    /** Pre-status raw list from the context source (not todo-filtered). */
    contexts: ContextList;
};

export type BaseBranchFn = (input: BaseBranchFnInput) => MaybePromise<string>;
