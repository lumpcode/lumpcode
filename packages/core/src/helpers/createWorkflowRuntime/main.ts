import type {
    Agent,
    AgentCommand,
    CommandOutputEvent,
    Context,
    ContextRunState,
    CreateAgentInput,
    Logger,
    LumpVariables,
    Shell,
    StepVariables,
} from '../../types';

export type CreateWorkflowRuntimeInput<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = {
    context: Context;
    lumpVariables: V;
    contextRunState: ContextRunState;
    projectRoot: string;
    workspacePath: string;
    /** Default command for `agent.session()` when it is a function. A string tag fails at call time. */
    command?: AgentCommand;
    /** Whole-workflow timeout. Omitted: 2 hours. */
    timeoutMillis?: number;
    /** Run abort signal (Ctrl-C, daemon stop, watchdog). */
    signal?: AbortSignal;
    onCommandOutput?: (event: CommandOutputEvent) => void;
    logger?: Logger;
    createAgent?: (input: CreateAgentInput<V>) => Agent;
    /**
     * Replaces `AbortSignal.timeout` for the workflow deadline.
     * Called once with the resolved timeout (step, else this input, else 2 hours).
     */
    createTimeoutSignal?: (timeoutMillis: number) => AbortSignal;
};

export type WorkflowRuntime = {
    agent: Agent;
    shell: Shell;
    /** Bound to the run signal and the workflow timeout. */
    signal: AbortSignal;
    log: (message: string) => void;
};

export function createWorkflowRuntime<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
>(_input: CreateWorkflowRuntimeInput<V, SV>): WorkflowRuntime {
    throw new Error('not implemented');
}
