import type { CommandFn } from './CommandFn';
import type { Context } from './Context';
import type { ContextRunState } from './ContextRunState';
import type { LumpVariables } from './LumpVariables';
import type { StepVariables } from './StepVariables';

/** A preset tag ('claude-code', 'cursor', a custom preset), or a raw command function. */
export type AgentCommand = string | CommandFn;

/** Preset-specific permission bag, as `agentPermissions` today. */
export type AgentPermissions = Record<string, unknown>;

export interface PromptOptions {
    /** Overrides lumpVariables.model. */
    model?: string;
    /** Overrides lumpVariables.agentPermissions. */
    permissions?: AgentPermissions;
    /** Overrides lumpVariables.extraArgs. */
    extraArgs?: string[];
    /** This call only. Omitted: the rest of the workflow's time. */
    timeoutMillis?: number;
    /** Logs, history, transcript. Default: first prompt line, 60 chars. */
    label?: string;
}

export interface SessionOptions extends PromptOptions {
    /** The agent's real session id. Omitted: a new session. */
    sessionId?: string;
}

export interface AgentResult {
    output: string;
    succeeded: boolean;
    exitCode: number | null;
    timedOut: boolean;
}

export interface AgentSession {
    /** Preset tag, or the CommandFn's commandName. */
    readonly command: string;
    readonly sessionId: string;
    /** Options layer: lump → session → this call. */
    prompt(text: string, options?: PromptOptions): Promise<AgentResult>;
}

export interface Agent {
    /** Default command, or options.command. */
    session(options?: SessionOptions & { command?: AgentCommand }): Promise<AgentSession>;
    /** Explicit command. A string tag needs a host createAgent. */
    session(command: AgentCommand, options?: SessionOptions): Promise<AgentSession>;
    /** The default command's default session. */
    prompt(text: string, options?: PromptOptions): Promise<AgentResult>;
}

export interface CreateAgentInput<V extends LumpVariables = LumpVariables> {
    context: Context;
    lumpVariables: V;
    contextRunState: ContextRunState;
    projectRoot: string;
    workspacePath: string;
    /** One agent call through the step executor. */
    runAgentCall(input: {
        commandFn: CommandFn<V>;
        commandName: string;
        prompt: string;
        sessionId: string;
        /** model, agentPermissions, extraArgs mapped from PromptOptions. */
        stepVariables: StepVariables;
        timeoutMillis?: number;
        label?: string;
    }): Promise<AgentResult>;
}
