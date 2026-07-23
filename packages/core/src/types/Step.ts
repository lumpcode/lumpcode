import { CommandFn } from "./CommandFn";
import { LumpVariables } from "./LumpVariables";
import { PostCommandExecFn } from "./PostCommandExecFn";
import { PromptFn } from "./PromptFn";
import { StepVariables } from "./StepVariables";

// testImpl stub: accept <V, SV>; stepVariables / hooks not refined until implementation
export type Step<
    _V extends LumpVariables = LumpVariables,
    _SV extends StepVariables = StepVariables,
> = {
    promptFn?: PromptFn;
    commandFn?: CommandFn;
    stepVariables?: StepVariables;
    postCommandExecFn?: PostCommandExecFn;
    continueOnError?: boolean;
    timeoutMillis?: number;
};
