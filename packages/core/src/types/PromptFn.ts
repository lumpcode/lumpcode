import { Context } from "./Context";
import { LumpVariables } from "./LumpVariables";
import { StepVariables } from "./StepVariables";
import { ContextRunState } from "./ContextRunState";
import { MaybePromise } from "./MaybePromise";

export interface PromptFnInput<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> { 
    context: Context;
    stepIndex: number | number[];
    contextRunState: ContextRunState;
    lumpVariables: V;
    stepVariables?: SV;
};

export type PromptFnOutput = MaybePromise<string>;

export type PromptFn<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = (params: PromptFnInput<V, SV>) => PromptFnOutput;
