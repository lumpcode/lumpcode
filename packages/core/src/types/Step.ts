import { CommandFn } from "./CommandFn";
import { PostCommandExecFn } from "./PostCommandExecFn";
import { PromptFn } from "./PromptFn";
import { StepVariables } from "./StepVariables";

export type Step = {
    promptFn?: PromptFn;
    commandFn?: CommandFn;
    stepVariables?: StepVariables;
    postCommandExecFn?: PostCommandExecFn;
    continueOnError?: boolean;
    timeoutMillis?: number;
};
