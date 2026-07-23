import { Context } from "./Context";
import { ContextRunState } from "./ContextRunState";
import { LumpVariables } from "./LumpVariables";
import { MaybePromise } from "./MaybePromise";

// testImpl stub: accept <V>; lumpVariables not refined until implementation
export type TeardownFn<_V extends LumpVariables = LumpVariables> = (params: {
    lumpVariables: LumpVariables;
    contextList: Context[];
    contextRunState: ContextRunState;
    currentContextIndex: number;
}) => MaybePromise<void>;
