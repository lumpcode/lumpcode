import { Context } from "./Context";
import { ContextRunState } from "./ContextRunState";
import { LumpVariables } from "./LumpVariables";
import { MaybePromise } from "./MaybePromise";

export type TeardownFn<V extends LumpVariables = LumpVariables> = (params: {
    lumpVariables: V;
    contextList: Context[];
    contextRunState: ContextRunState;
    currentContextIndex: number;
}) => MaybePromise<void>;
