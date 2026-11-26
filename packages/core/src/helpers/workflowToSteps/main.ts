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

export function isWorkflowStep<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
>(step: unknown): step is WorkflowStep<V, SV> {
    return (
        typeof step === 'object'
        && step !== null
        && 'kind' in step
        && (step as { kind?: unknown }).kind === 'workflow'
        && 'workflowFn' in step
        && typeof (step as { workflowFn?: unknown }).workflowFn === 'function'
    );
}

export function workflowToSteps<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
>(workflow: WorkflowFn<V, SV>, timeoutMillis?: number): WorkflowStep<V, SV>[] {
    if (timeoutMillis === undefined) {
        return [{ kind: 'workflow', workflowFn: workflow }];
    }
    return [{ kind: 'workflow', workflowFn: workflow, timeoutMillis }];
}
