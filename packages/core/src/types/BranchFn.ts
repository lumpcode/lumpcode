import { Context } from "./Context";
import { ContextRunState } from "./ContextRunState";
import { LumpVariables } from "./LumpVariables";
import { MaybePromise } from "./MaybePromise";

export type BranchFn<V extends LumpVariables = LumpVariables> = (params: {
    contextList: Context[];
    contextRunStateList: ContextRunState[];
    lumpVariables: V;
}) => MaybePromise<string>;
