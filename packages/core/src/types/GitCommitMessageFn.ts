import { Context } from "./Context";
import { LumpVariables } from "./LumpVariables";

export type GitCommitMessageFnInput<V extends LumpVariables = LumpVariables> = {
    context: Context;
    lumpVariables: V;
    baseBranch: string;
};

export type GitCommitMessageFn<V extends LumpVariables = LumpVariables> = (
    input: GitCommitMessageFnInput<V>,
) => string;
