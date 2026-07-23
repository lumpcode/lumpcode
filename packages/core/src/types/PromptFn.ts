import { Context } from "./Context";
import { LumpVariables } from "./LumpVariables";
import { StepVariables } from "./StepVariables";
import { ContextRunState } from "./ContextRunState";
import { MaybePromise } from "./MaybePromise";

// testImpl stub: accept <V, SV> so type tests compile; bags not threaded until implementation
export interface PromptFnInput<
    _V extends LumpVariables = LumpVariables,
    _SV extends StepVariables = StepVariables,
> { 
    context: Context;
    stepIndex: number | number[];
    contextRunState: ContextRunState;
    lumpVariables: LumpVariables;
    stepVariables?: StepVariables;
};

export type PromptFnOutput = MaybePromise<string>;

export type PromptFn<
    _V extends LumpVariables = LumpVariables,
    _SV extends StepVariables = StepVariables,
> = (params: PromptFnInput) => PromptFnOutput;
