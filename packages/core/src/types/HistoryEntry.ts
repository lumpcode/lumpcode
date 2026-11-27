import type { SessionId } from './SessionId';
import { Context } from './Context';
import { ContextRunState } from './ContextRunState';
import { LumpVariables } from './LumpVariables';
import { StepVariables } from './StepVariables';
import { WorkflowResult } from './Workflow';

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
    /** Absent on a classic step. */
    kind?: 'prompt' | 'command' | 'shell' | 'workflow';
    label?: string;
    command?: string;
    sessionId?: SessionId;
    workflowResult?: WorkflowResult<SV>;
};
