import { StepVariables } from "./StepVariables";
import { Context } from "./Context";
import { ContextRunState } from "./ContextRunState";
import { LumpVariables } from "./LumpVariables";
import { MaybePromise } from "./MaybePromise";

export type CommandDescriptor = {
    executable: string;
    args: string[];
    env?: Record<string, string>;
};

export type CommandFn = ((params: {
    context: Context;
    prompt: string;
    stepIndex: number | number[];
    contextRunState: ContextRunState;
    lumpVariables: LumpVariables;
    stepVariables?: StepVariables;
    projectRoot: string;
    workspacePath: string;
}) => MaybePromise<CommandDescriptor | null | undefined | void>) & {
    commandName?: string;
};
