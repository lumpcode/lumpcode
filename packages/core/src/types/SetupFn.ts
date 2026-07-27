import { Context } from "./Context";
import { LumpVariables } from "./LumpVariables";
import { ContextRunState } from "./ContextRunState";
import { Maybe } from "./Maybe";
import { MaybePromise } from "./MaybePromise";

export type SetupFn<V extends LumpVariables = LumpVariables> = (params: {
    contextList: Context[];
    lumpVariables: V;
    currentContextIndex: number;
}) => MaybePromise<Maybe<Partial<{
    contextRunState: ContextRunState;
}>>>;
