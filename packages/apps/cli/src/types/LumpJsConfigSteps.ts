import { LumpJsConfigStep } from "./LumpJsConfigStep";
import { MaybePromise } from "@lumpcode/core";
import { PromptFnInput } from "@lumpcode/core";

export type LumpJsConfigSteps = Array<
LumpJsConfigStep
| ((input: Exclude<PromptFnInput, 'stepVariables'>) => MaybePromise<LumpJsConfigSteps>)
| LumpJsConfigStep['promptTemplate']
>;
