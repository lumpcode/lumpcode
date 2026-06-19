import { Context } from "./Context";
import { LumpVariables } from "./LumpVariables";
import { StepVariables } from "./StepVariables";
import { ContextRunState } from "./ContextRunState";
import { MaybePromise } from "./MaybePromise";

export interface PromptFnInput { 
    context: Context;
    stepIndex: number | number[];
    contextRunState: ContextRunState;
    lumpVariables: LumpVariables;
    stepVariables?: StepVariables;
};

export type PromptFnOutput = MaybePromise<string>;

export type PromptFn = (params: PromptFnInput) => PromptFnOutput;
