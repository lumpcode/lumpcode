import { Context } from "./Context";
import { ContextRunState } from "./ContextRunState";
import { LumpVariables } from "./LumpVariables";
import { MaybePromise } from "./MaybePromise";

export type TeardownFn = (params: {
    lumpVariables: LumpVariables;
    contextList: Context[];
    contextRunState: ContextRunState;
    currentContextIndex: number;
}) => MaybePromise<void>;