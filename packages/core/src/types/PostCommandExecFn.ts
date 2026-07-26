import { Context } from "./Context";
import { ContextRunState } from "./ContextRunState";
import { LumpVariables } from "./LumpVariables";
import { MaybePromise } from "./MaybePromise";
import { StepVariables } from "./StepVariables";

// testImpl stub: accept <V, SV>; bags not threaded until implementation
export type PostCommandExecFn<
    _V extends LumpVariables = LumpVariables,
    _SV extends StepVariables = StepVariables,
> = (input: {
    commandResult: string;
    commandSucceeded: boolean;
    context: Context;
    prompt: string;
    stepIndex: number | number[];
    contextRunState: ContextRunState;
    lumpVariables: LumpVariables;
    stepVariables?: StepVariables;
    projectRoot: string;
}) => MaybePromise<void>
