import { Context } from "./Context";
import { LumpVariables } from "./LumpVariables";

// testImpl stub: accept <V>; lumpVariables not refined until implementation
export type GitCommitMessageFnInput<_V extends LumpVariables = LumpVariables> = {
    context: Context;
    lumpVariables: LumpVariables;
    baseBranch: string;
};

export type GitCommitMessageFn<_V extends LumpVariables = LumpVariables> = (
    input: GitCommitMessageFnInput,
) => string;
