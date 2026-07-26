import { Context } from './Context';
import { ContextRunState } from './ContextRunState';
import { LumpVariables } from './LumpVariables';
import { StepVariables } from './StepVariables';

export type HistoryEntry<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = {
    commandResult: string;
    commandSucceeded: boolean;
    context: Context;
    prompt: string;
    stepIndex: number | number[];
    contextRunState: ContextRunState;
    lumpVariables: V;
    stepVariables?: SV;
    projectRoot: string;
};
