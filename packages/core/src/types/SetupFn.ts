import { Context } from "./Context";
import { LumpVariables } from "./LumpVariables";
import { ContextRunState } from "./ContextRunState";
import { Maybe } from "./Maybe";
import { MaybePromise } from "./MaybePromise";

export type SetupFn = (params: {
    contextList: Context[];
    lumpVariables: LumpVariables;
    currentContextIndex: number;
}) => MaybePromise<Maybe<Partial<{
    contextRunState: ContextRunState;
}>>>;