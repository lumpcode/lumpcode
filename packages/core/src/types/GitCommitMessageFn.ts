import { Context } from "./Context";
import { LumpVariables } from "./LumpVariables";

export type GitCommitMessageFnInput = {
    context: Context;
    lumpVariables: LumpVariables;
    baseBranch: string;
};

export type GitCommitMessageFn = (input: GitCommitMessageFnInput) => string;
