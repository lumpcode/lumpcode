import { LumpJsConfigStep } from "./LumpJsConfigStep";
import { MaybePromise, LumpVariables, StepVariables } from "@lumpcode/core";
import { PromptFnInput } from "@lumpcode/core";

// testImpl stub: accept <V, SV>; not threaded until implementation
export type LumpJsConfigStepsFn<
    _V extends LumpVariables = LumpVariables,
    _SV extends StepVariables = StepVariables,
> = (
    input: Omit<PromptFnInput, 'stepVariables'>
) => MaybePromise<LumpJsConfigSteps | LumpJsConfigStepsItem>;

export type StepFn<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = LumpJsConfigStepsFn<V, SV>;

export type LumpJsConfigStepsItem<
    _V extends LumpVariables = LumpVariables,
    _SV extends StepVariables = StepVariables,
> =
    | LumpJsConfigStep
    | LumpJsConfigStepsFn
    | LumpJsConfigStep['promptTemplate'];

export type LumpJsConfigSteps<
    _V extends LumpVariables = LumpVariables,
    _SV extends StepVariables = StepVariables,
> = Array<LumpJsConfigStepsItem>;
