import { CommandFn } from "./CommandFn";
import { LumpVariables } from "./LumpVariables";
import { PostCommandExecFn } from "./PostCommandExecFn";
import { PromptFn } from "./PromptFn";
import { StepVariables } from "./StepVariables";

export type Step<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = {
    promptFn?: PromptFn<V, SV>;
    commandFn?: CommandFn<V, SV>;
    stepVariables?: SV;
    postCommandExecFn?: PostCommandExecFn<V, SV>;
    continueOnError?: boolean;
    timeoutMillis?: number;
};
