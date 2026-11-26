import type { LumpVariables, StepVariables, WorkflowFn } from '../../types';

/** Internal step. Not exported from the package. */
export type WorkflowStep<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = {
    kind: 'workflow';
    workflowFn: WorkflowFn<V, SV>;
    timeoutMillis?: number;
};

export function workflowToSteps<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
>(workflow: WorkflowFn<V, SV>, timeoutMillis?: number): WorkflowStep<V, SV>[] {
    void workflow;
    void timeoutMillis;
    throw new Error('not implemented');
}
