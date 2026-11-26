import { randomUUID } from 'node:crypto';

import type {
    Agent,
    AgentCommand,
    AgentResult,
    AgentSession,
    CommandDescriptor,
    CommandFn,
    CommandOutputEvent,
    Context,
    ContextRunState,
    CreateAgentInput,
    HistoryEntry,
    Logger,
    LumpVariables,
    PromptOptions,
    SessionOptions,
    Shell,
    ShellOptions,
    ShellResult,
    StepVariables,
} from '../../types';
import { execBinary } from '../execBinary';
import { detectSystemdScope, systemdScopeUnitName } from '../../utils';

/** setTimeout delays above this are clamped to 1ms. */
const MAX_TIMEOUT_MILLIS = 2_147_483_647;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const PROMPT_LABEL_MAX = 60;
/**
 * A call that stays alone streams. Hold its first chunks briefly so a second
 * call started while this one is still producing keeps the two outputs
 * unmixed; parallel calls then flush per call, in the order they finish.
 */
const SOLE_CALL_STREAM_DELAY_MS = 400;

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
    /** Workflow step index. Inner calls use `[workflowStepIndex, n]`. */
    workflowStepIndex?: number;
    /** Names the per-call systemd scope when one is available. */
    lumpName?: string;
    onHistoryEntry?: (entry: HistoryEntry<V, SV>) => Promise<void> | void;
};

export type WorkflowRuntime = {
    agent: Agent;
    shell: Shell;
    /** Bound to the run signal and the workflow timeout. */
    signal: AbortSignal;
    log: (message: string) => void;
};

type LiveCall = {
    overlapped: boolean;
    streaming: boolean;
    settled: boolean;
    bufferedChunks: CommandOutputEvent[];
    promoteTimer?: ReturnType<typeof setTimeout>;
};

type ProcessOutcome = {
    output: string;
    succeeded: boolean;
    exitCode: number | null;
    timedOut: boolean;
    aborted: boolean;
};

function abortError(): Error {
    const error = new Error('Process aborted');
    error.name = 'AbortError';
    return error;
}

function defaultPromptLabel(text: string): string {
    const firstLine = text.split('\n')[0] ?? '';
    return firstLine.slice(0, PROMPT_LABEL_MAX);
}

function combinedOutput(stdout?: string, stderr?: string): string {
    return `${stdout ?? ''}${stderr ?? ''}`;
}

function mergeEnv(
    descriptorEnv?: Record<string, string>,
    optionEnv?: Record<string, string>,
): NodeJS.ProcessEnv | undefined {
    if (descriptorEnv === undefined && optionEnv === undefined) return undefined;
    return { ...process.env, ...descriptorEnv, ...optionEnv };
}

function shellCommandText(command: string | CommandDescriptor): string {
    if (typeof command === 'string') return command;
    return [command.executable, ...command.args].join(' ');
}

export function createWorkflowRuntime<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
>(input: CreateWorkflowRuntimeInput<V, SV>): WorkflowRuntime {
    const {
        context,
        lumpVariables,
        contextRunState,
        projectRoot,
        workspacePath,
        command: defaultCommand,
        timeoutMillis,
        signal: runSignal,
        onCommandOutput,
        logger,
        createAgent,
        createTimeoutSignal,
        workflowStepIndex = 0,
        lumpName,
        onHistoryEntry,
    } = input;

    const deadline = timeoutMillis ?? TWO_HOURS_MS;
    const timeoutSignal = (createTimeoutSignal ?? ((millis: number) => AbortSignal.timeout(millis)))(deadline);
    const signal = runSignal !== undefined
        ? AbortSignal.any([runSignal, timeoutSignal])
        : timeoutSignal;

    const liveCalls = new Set<LiveCall>();
    const promptsInFlight = new Set<string>();
    const sessionOwners = new Map<string, string>();
    let callOrdinal = 0;
    let defaultPromptSession: AgentSession | undefined;

    function emit(event: CommandOutputEvent): void {
        onCommandOutput?.(event);
    }

    function takeCallIndex(): number[] {
        callOrdinal += 1;
        return [workflowStepIndex, callOrdinal];
    }

    function beginCall(): LiveCall {
        const call: LiveCall = {
            overlapped: false,
            streaming: false,
            settled: false,
            bufferedChunks: [],
        };
        liveCalls.add(call);
        if (liveCalls.size > 1) {
            for (const other of liveCalls) {
                other.overlapped = true;
                other.streaming = false;
                if (other.promoteTimer !== undefined) {
                    clearTimeout(other.promoteTimer);
                    other.promoteTimer = undefined;
                }
            }
        }
        return call;
    }

    function promoteToStreaming(call: LiveCall): void {
        call.promoteTimer = undefined;
        if (call.settled || call.overlapped || !liveCalls.has(call) || liveCalls.size !== 1) return;
        call.streaming = true;
        const chunks = call.bufferedChunks.splice(0);
        for (const chunk of chunks) emit(chunk);
    }

    function pushChunk(call: LiveCall, event: CommandOutputEvent): void {
        if (call.streaming && !call.overlapped && liveCalls.size === 1) {
            emit(event);
            return;
        }
        call.bufferedChunks.push(event);
        if (
            !call.overlapped
            && !call.streaming
            && liveCalls.size === 1
            && call.promoteTimer === undefined
        ) {
            call.promoteTimer = setTimeout(() => promoteToStreaming(call), SOLE_CALL_STREAM_DELAY_MS);
        }
    }

    function finishCall(call: LiveCall): void {
        if (call.settled) return;
        call.settled = true;
        if (call.promoteTimer !== undefined) {
            clearTimeout(call.promoteTimer);
            call.promoteTimer = undefined;
        }
        liveCalls.delete(call);
        const chunks = call.bufferedChunks.splice(0);
        for (const chunk of chunks) emit(chunk);
    }

    function layerStepVariables(sessionOptions: PromptOptions, callOptions?: PromptOptions): StepVariables {
        const stepVariables: StepVariables = {};
        const model = callOptions?.model ?? sessionOptions.model ?? lumpVariables.model;
        const extraArgs = callOptions?.extraArgs ?? sessionOptions.extraArgs ?? lumpVariables.extraArgs;
        const permissions = callOptions?.permissions
            ?? sessionOptions.permissions
            ?? lumpVariables.agentPermissions;
        if (model !== undefined) stepVariables.model = model;
        if (extraArgs !== undefined) stepVariables.extraArgs = extraArgs;
        if (permissions !== undefined) stepVariables.agentPermissions = permissions;
        return stepVariables;
    }

    function resolvePromptLabel(
        text: string,
        sessionOptions: PromptOptions,
        callOptions?: PromptOptions,
    ): string {
        if (callOptions?.label !== undefined) return callOptions.label;
        if (sessionOptions.label !== undefined) return sessionOptions.label;
        return defaultPromptLabel(text);
    }

    async function runBinary(binary: {
        executable: string;
        args: string[];
        cwd: string;
        env?: NodeJS.ProcessEnv;
        timeoutMillis?: number;
        stepIndex: number[];
        call: LiveCall;
    }): Promise<ProcessOutcome> {
        const scopeSupport = await detectSystemdScope();
        const execResult = await execBinary({
            binaryPath: binary.executable,
            args: binary.args,
            cwd: binary.cwd,
            timeoutMillis: binary.timeoutMillis ?? MAX_TIMEOUT_MILLIS,
            stdio: ['inherit', 'pipe', 'pipe'],
            signal,
            logger,
            isolation: scopeSupport.available
                ? {
                    kind: 'systemdScope',
                    unitName: systemdScopeUnitName({
                        lumpName,
                        contextName: context.name,
                        stepIndex: binary.stepIndex,
                    }),
                }
                : { kind: 'processGroup' },
            ...(binary.env !== undefined ? { env: binary.env } : {}),
            onChunk: ({ stream, chunk }) => {
                pushChunk(binary.call, {
                    kind: 'chunk',
                    contextName: context.name,
                    stepIndex: binary.stepIndex,
                    stream,
                    chunk,
                });
            },
        });

        if (signal.aborted || (!execResult.success && execResult.data.reason === 'aborted')) {
            const output = execResult.success
                ? combinedOutput(execResult.data.stdout, execResult.data.stderr)
                : combinedOutput(execResult.data.stdout, execResult.data.stderr);
            return { output, succeeded: false, exitCode: null, timedOut: false, aborted: true };
        }

        if (!execResult.success && execResult.data.reason === 'timeout') {
            return {
                output: combinedOutput(execResult.data.stdout, execResult.data.stderr),
                succeeded: false,
                exitCode: null,
                timedOut: true,
                aborted: false,
            };
        }

        if (!execResult.success) {
            return {
                output: combinedOutput(execResult.data.stdout, execResult.data.stderr),
                succeeded: false,
                exitCode: execResult.data.code ?? null,
                timedOut: false,
                aborted: false,
            };
        }

        return {
            output: combinedOutput(execResult.data.stdout, execResult.data.stderr),
            succeeded: true,
            exitCode: 0,
            timedOut: false,
            aborted: false,
        };
    }

    async function recordCall(entry: {
        kind: 'prompt' | 'shell';
        label: string;
        command: string;
        prompt: string;
        stepIndex: number[];
        outcome: ProcessOutcome;
        sessionId?: string;
        stepVariables?: StepVariables;
    }): Promise<void> {
        if (!onHistoryEntry) return;
        await onHistoryEntry({
            commandResult: entry.outcome.output,
            commandSucceeded: entry.outcome.succeeded,
            context,
            prompt: entry.prompt,
            stepIndex: entry.stepIndex,
            contextRunState,
            lumpVariables,
            projectRoot,
            kind: entry.kind,
            label: entry.label,
            command: entry.command,
            ...(entry.sessionId !== undefined ? { sessionId: entry.sessionId } : {}),
            ...(entry.stepVariables !== undefined && Object.keys(entry.stepVariables).length > 0
                ? { stepVariables: entry.stepVariables as SV }
                : {}),
        });
    }

    function emitEnd(stepIndex: number[], outcome: ProcessOutcome | undefined): void {
        emit({
            kind: 'end',
            contextName: context.name,
            stepIndex,
            succeeded: outcome?.succeeded ?? false,
            exitCode: outcome?.exitCode ?? null,
            timedOut: outcome?.timedOut ?? false,
        });
    }

    async function runShell(
        command: string | CommandDescriptor,
        options?: ShellOptions,
    ): Promise<ShellResult> {
        if (signal.aborted) throw abortError();

        const commandText = shellCommandText(command);
        const executable = typeof command === 'string' ? 'sh' : command.executable;
        const args = typeof command === 'string' ? ['-c', command] : command.args;
        const descriptorEnv = typeof command === 'string' ? undefined : command.env;
        const label = options?.label ?? commandText;
        const stepIndex = takeCallIndex();
        const call = beginCall();

        emit({
            kind: 'start',
            contextName: context.name,
            stepIndex,
            executable,
            callKind: 'shell',
            label,
            lumpVariables,
        });

        let outcome: ProcessOutcome | undefined;
        try {
            outcome = await runBinary({
                executable,
                args,
                cwd: options?.cwd ?? workspacePath,
                env: mergeEnv(descriptorEnv, options?.env),
                timeoutMillis: options?.timeoutMillis,
                stepIndex,
                call,
            });
        } finally {
            finishCall(call);
            emitEnd(stepIndex, outcome);
        }

        if (outcome) {
            await recordCall({
                kind: 'shell',
                label,
                command: commandText,
                prompt: '',
                stepIndex,
                outcome,
            });
            if (outcome.aborted) throw abortError();
            return {
                output: outcome.output,
                succeeded: outcome.succeeded,
                exitCode: outcome.exitCode,
                timedOut: outcome.timedOut,
            };
        }
        throw abortError();
    }

    const shell: Shell = (command, options) => runShell(command, options);

    async function runAgentCall(
        callInput: Parameters<CreateAgentInput<V>['runAgentCall']>[0],
    ): Promise<AgentResult> {
        if (signal.aborted) throw abortError();
        if (promptsInFlight.has(callInput.sessionId)) {
            throw new Error(`Session ${callInput.sessionId} is already running a prompt.`);
        }
        promptsInFlight.add(callInput.sessionId);

        const stepIndex = takeCallIndex();
        const call = beginCall();
        const label = callInput.label ?? defaultPromptLabel(callInput.prompt);
        let outcome: ProcessOutcome | undefined;
        let started = false;

        try {
            const descriptor = await callInput.commandFn({
                context,
                prompt: callInput.prompt,
                stepIndex,
                contextRunState,
                lumpVariables,
                stepVariables: callInput.stepVariables,
                projectRoot,
                workspacePath,
                sessionId: callInput.sessionId,
            });

            if (descriptor != null) {
                started = true;
                emit({
                    kind: 'start',
                    contextName: context.name,
                    stepIndex,
                    executable: descriptor.executable,
                    callKind: 'prompt',
                    label,
                    sessionId: callInput.sessionId,
                    commandName: callInput.commandName,
                    lumpVariables,
                    ...(Object.keys(callInput.stepVariables).length > 0
                        ? { stepVariables: callInput.stepVariables }
                        : {}),
                });
                outcome = await runBinary({
                    executable: descriptor.executable,
                    args: descriptor.args,
                    cwd: workspacePath,
                    env: mergeEnv(descriptor.env, undefined),
                    timeoutMillis: callInput.timeoutMillis,
                    stepIndex,
                    call,
                });
            } else {
                outcome = {
                    output: '',
                    succeeded: true,
                    exitCode: 0,
                    timedOut: false,
                    aborted: false,
                };
            }
        } finally {
            finishCall(call);
            promptsInFlight.delete(callInput.sessionId);
            if (started) emitEnd(stepIndex, outcome);
        }

        if (!outcome) throw abortError();
        await recordCall({
            kind: 'prompt',
            label,
            command: callInput.commandName,
            prompt: callInput.prompt,
            stepIndex,
            outcome,
            sessionId: callInput.sessionId,
            stepVariables: callInput.stepVariables,
        });
        if (outcome.aborted) throw abortError();
        return {
            output: outcome.output,
            succeeded: outcome.succeeded,
            exitCode: outcome.exitCode,
            timedOut: outcome.timedOut,
        };
    }

    function readSessionArgs(
        commandOrOptions?: AgentCommand | (SessionOptions & { command?: AgentCommand }),
        maybeOptions?: SessionOptions & { command?: AgentCommand },
    ): { command?: AgentCommand; options: SessionOptions } {
        if (typeof commandOrOptions === 'string' || typeof commandOrOptions === 'function') {
            if (maybeOptions?.command !== undefined) {
                throw new Error('Pass the command once: as the first argument or as options.command.');
            }
            return { command: commandOrOptions, options: maybeOptions ?? {} };
        }
        const { command, ...options } = commandOrOptions ?? {};
        return { command, options };
    }

    function resolveCommandFn(explicit: AgentCommand | undefined): CommandFn<V, SV> {
        const selected = explicit !== undefined ? explicit : defaultCommand;
        if (typeof selected === 'string') {
            throw new Error(
                `Command tags like "${selected}" need a host that resolves them (the Lumpcode CLI); pass a CommandFn.`,
            );
        }
        if (typeof selected !== 'function') {
            throw new Error('Pass a CommandFn. There is no default command for this workflow.');
        }
        return selected;
    }

    function promptOptionsOnly(options: SessionOptions): PromptOptions {
        return {
            ...(options.model !== undefined ? { model: options.model } : {}),
            ...(options.permissions !== undefined ? { permissions: options.permissions } : {}),
            ...(options.extraArgs !== undefined ? { extraArgs: options.extraArgs } : {}),
            ...(options.timeoutMillis !== undefined ? { timeoutMillis: options.timeoutMillis } : {}),
            ...(options.label !== undefined ? { label: options.label } : {}),
        };
    }

    function makeSession(
        commandFn: CommandFn<V, SV>,
        commandName: string,
        sessionId: string,
        sessionOptions: PromptOptions,
    ): AgentSession {
        return {
            command: commandName,
            sessionId,
            prompt(text, callOptions) {
                return runAgentCall({
                    commandFn: commandFn as CommandFn<V>,
                    commandName,
                    prompt: text,
                    sessionId,
                    stepVariables: layerStepVariables(sessionOptions, callOptions),
                    timeoutMillis: callOptions?.timeoutMillis ?? sessionOptions.timeoutMillis,
                    label: resolvePromptLabel(text, sessionOptions, callOptions),
                });
            },
        };
    }

    async function openSession(
        commandOrOptions?: AgentCommand | (SessionOptions & { command?: AgentCommand }),
        maybeOptions?: SessionOptions & { command?: AgentCommand },
    ): Promise<AgentSession> {
        const { command, options } = readSessionArgs(commandOrOptions, maybeOptions);
        const commandFn = resolveCommandFn(command);
        const commandName = typeof commandFn.commandName === 'string' && commandFn.commandName.length > 0
            ? commandFn.commandName
            : 'command';

        let sessionId = options.sessionId;
        if (sessionId === undefined) {
            sessionId = randomUUID();
        } else {
            const owner = sessionOwners.get(sessionId);
            if (owner !== undefined && owner !== commandName) {
                throw new Error(`Session ${sessionId} belongs to command ${owner}, not ${commandName}.`);
            }
        }
        sessionOwners.set(sessionId, commandName);
        return makeSession(commandFn, commandName, sessionId, promptOptionsOnly(options));
    }

    async function prompt(text: string, options?: PromptOptions): Promise<AgentResult> {
        if (defaultPromptSession === undefined) {
            defaultPromptSession = await openSession();
        }
        return defaultPromptSession.prompt(text, options);
    }

    const defaultAgent: Agent = {
        session: openSession,
        prompt,
    };

    const agent = createAgent
        ? createAgent({
            context,
            lumpVariables,
            contextRunState,
            projectRoot,
            workspacePath,
            runAgentCall,
        })
        : defaultAgent;

    function log(message: string): void {
        logger?.info(message);
        emit({ kind: 'log', contextName: context.name, message });
    }

    return { agent, shell, signal, log };
}
