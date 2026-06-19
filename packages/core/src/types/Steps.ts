import { Step } from "./Step";
import { MaybePromise } from "./MaybePromise";
import { PromptFnInput } from "./PromptFn";

export type Steps = Array<
Step
| ((input: Exclude<PromptFnInput, 'stepVariables'>) => MaybePromise<Steps>)
>;
