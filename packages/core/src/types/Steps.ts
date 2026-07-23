import { Step } from "./Step";
import { MaybePromise } from "./MaybePromise";
import { PromptFnInput } from "./PromptFn";
import { LumpVariables } from "./LumpVariables";
import { StepVariables } from "./StepVariables";

// testImpl stub: accept <V, SV>; not threaded until implementation
export type Steps<
    _V extends LumpVariables = LumpVariables,
    _SV extends StepVariables = StepVariables,
> = Array<
Step
| ((input: Exclude<PromptFnInput, 'stepVariables'>) => MaybePromise<Steps>)
>;
