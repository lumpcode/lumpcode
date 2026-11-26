import type { Agent } from './Agent';
import type { Context } from './Context';
import type { ContextRunState } from './ContextRunState';
import type { LumpVariables } from './LumpVariables';
import type { Shell } from './Shell';
import type { StepVariables } from './StepVariables';

export interface WorkflowInput<V extends LumpVariables = LumpVariables> {
    context: Context;
    lumpVariables: V;
    contextRunState: ContextRunState;
    projectRoot: string;
    workspacePath: string;
    /** Read-only. For the author's own async work. Never passed to agent or shell. */
    signal: AbortSignal;
    agent: Agent;
    shell: Shell;
    /** Written to the run log and emitted as a `log` event. */
    log: (message: string) => void;
}

export interface WorkflowResult<SV extends StepVariables = StepVariables> {
    /** Default true. */
    succeeded?: boolean;
    /** Default true. false: no commit, no push, context stays toDo. */
    push?: boolean;
    message?: string;
    /** Stored as the workflow step's stepVariables. */
    variables?: SV;
}

export type WorkflowFn<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = (input: WorkflowInput<V>) => Promise<WorkflowResult<SV> | void>;
