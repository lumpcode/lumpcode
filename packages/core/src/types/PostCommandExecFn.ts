import { Context } from "./Context";
import { ContextRunState } from "./ContextRunState";
import { LumpVariables } from "./LumpVariables";
import { MaybePromise } from "./MaybePromise";
import { StepVariables } from "./StepVariables";

export type PostCommandExecFn<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = (input: {
    commandResult: string;
    commandSucceeded: boolean;
    context: Context;
    prompt: string;
    stepIndex: number | number[];
    contextRunState: ContextRunState;
    lumpVariables: V;
    stepVariables?: SV;
    projectRoot: string;
}) => MaybePromise<void>
