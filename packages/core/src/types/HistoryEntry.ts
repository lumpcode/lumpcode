import { Context } from './Context';
import { ContextRunState } from './ContextRunState';
import { LumpVariables } from './LumpVariables';
import { StepVariables } from './StepVariables';

// testImpl stub: accept <V, SV>; bags not threaded until implementation
export type HistoryEntry<
    _V extends LumpVariables = LumpVariables,
    _SV extends StepVariables = StepVariables,
> = {
    commandResult: string;
    commandSucceeded: boolean;
    context: Context;
    prompt: string;
    stepIndex: number | number[];
    contextRunState: ContextRunState;
    lumpVariables: LumpVariables;
    stepVariables?: StepVariables;
    projectRoot: string;
};
