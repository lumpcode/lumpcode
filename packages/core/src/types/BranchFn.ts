import { Context } from "./Context";
import { ContextRunState } from "./ContextRunState";
import { LumpVariables } from "./LumpVariables";
import { MaybePromise } from "./MaybePromise";

// testImpl stub: accept <V>; lumpVariables not refined until implementation
export type BranchFn<_V extends LumpVariables = LumpVariables> = (params: {
    contextList: Context[];
    contextRunStateList: ContextRunState[];
    lumpVariables: LumpVariables;
}) => MaybePromise<string>;
