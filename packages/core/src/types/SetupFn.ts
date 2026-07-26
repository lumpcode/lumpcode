import { Context } from "./Context";
import { LumpVariables } from "./LumpVariables";
import { ContextRunState } from "./ContextRunState";
import { Maybe } from "./Maybe";
import { MaybePromise } from "./MaybePromise";

// testImpl stub: accept <V>; lumpVariables not refined until implementation
export type SetupFn<_V extends LumpVariables = LumpVariables> = (params: {
    contextList: Context[];
    lumpVariables: LumpVariables;
    currentContextIndex: number;
}) => MaybePromise<Maybe<Partial<{
    contextRunState: ContextRunState;
}>>>;
