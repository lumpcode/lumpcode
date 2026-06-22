import { Context } from './Context';
import { ContextRunState } from './ContextRunState';
import { LumpVariables } from './LumpVariables';
import { StepVariables } from './StepVariables';

export type HistoryEntry = {
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
