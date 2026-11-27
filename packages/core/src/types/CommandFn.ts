import type { SessionId } from "./SessionId";
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

export type CommandFn<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = ((params: {
    context: Context;
    prompt: string;
    stepIndex: number | number[];
    contextRunState: ContextRunState;
    lumpVariables: V;
    stepVariables?: SV;
    projectRoot: string;
    workspacePath: string;
    /** Set by a workflow prompt. Absent for steps. */
    sessionId?: SessionId;
}) => MaybePromise<CommandDescriptor | null | undefined | void>) & {
    commandName?: string;
};
