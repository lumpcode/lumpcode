import { Step } from "./Step";
import { MaybePromise } from "./MaybePromise";
import { PromptFnInput } from "./PromptFn";
import { LumpVariables } from "./LumpVariables";
import { StepVariables } from "./StepVariables";

export type Steps<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = Array<
    | Step<V, SV>
    | ((input: Omit<PromptFnInput<V, SV>, 'stepVariables'>) => MaybePromise<Steps<V, SV>>)
>;
