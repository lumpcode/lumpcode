import { LumpJsConfigStep } from "./LumpJsConfigStep";
import { MaybePromise, LumpVariables, StepVariables } from "@lumpcode/core";
import { PromptFnInput } from "@lumpcode/core";

export type LumpJsConfigStepsFn<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = (
    input: Omit<PromptFnInput<V, SV>, 'stepVariables'>
) => MaybePromise<LumpJsConfigSteps<V, SV> | LumpJsConfigStepsItem<V, SV>>;

export type StepFn<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = LumpJsConfigStepsFn<V, SV>;

export type LumpJsConfigStepsItem<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> =
    | LumpJsConfigStep<V, SV>
    | LumpJsConfigStepsFn<V, SV>
    | LumpJsConfigStep<V, SV>['promptTemplate'];

export type LumpJsConfigSteps<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = Array<LumpJsConfigStepsItem<V, SV>>;
