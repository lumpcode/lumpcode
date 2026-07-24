import { LumpJsConfigStep } from "./LumpJsConfigStep";
import { MaybePromise } from "@lumpcode/core";
import { PromptFnInput } from "@lumpcode/core";

export type LumpJsConfigStepsFn = (
    input: Omit<PromptFnInput, 'stepVariables'>
) => MaybePromise<LumpJsConfigSteps | LumpJsConfigStepsItem>;

export type StepFn = LumpJsConfigStepsFn;

export type LumpJsConfigStepsItem =
    | LumpJsConfigStep
    | LumpJsConfigStepsFn
    | LumpJsConfigStep['promptTemplate'];

export type LumpJsConfigSteps = Array<LumpJsConfigStepsItem>;
