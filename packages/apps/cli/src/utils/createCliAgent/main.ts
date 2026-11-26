import { randomUUID } from 'node:crypto';

import type {
    Agent,
    AgentCommand,
    AgentResult,
    AgentSession,
    CommandFn,
    CreateAgentInput,
    LumpVariables,
    PromptOptions,
    SessionOptions,
    StepVariables,
} from '@lumpcode/core';

import type { CommandModule } from '../../types/CommandModule';

export type LoadCliCommandModule = (commandName: string) => Promise<CommandModule>;

const PROMPT_LABEL_MAX = 60;

type PreparedCommand = {
    commandFn: CommandFn;
    commandName: string;
    createSession?: CommandModule['createSession'];
    setupSessionId?: string;
};

function commandNameOf(commandFn: CommandFn): string {
    return typeof commandFn.commandName === 'string' && commandFn.commandName.length > 0
        ? commandFn.commandName
        : 'command';
}

function defaultPromptLabel(text: string): string {
    const firstLine = text.split('\n')[0] ?? '';
    return firstLine.slice(0, PROMPT_LABEL_MAX);
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

function promptOptionsOnly(options: SessionOptions): PromptOptions {
    return {
        ...(options.model !== undefined ? { model: options.model } : {}),
        ...(options.permissions !== undefined ? { permissions: options.permissions } : {}),
        ...(options.extraArgs !== undefined ? { extraArgs: options.extraArgs } : {}),
        ...(options.timeoutMillis !== undefined ? { timeoutMillis: options.timeoutMillis } : {}),
        ...(options.label !== undefined ? { label: options.label } : {}),
    };
}

export function createCliAgent(factoryInput: {
    commandModules: Map<string, CommandModule>;
    loadCommandModule: LoadCliCommandModule;
    defaultCommand?: string | CommandFn;
}): (input: CreateAgentInput<LumpVariables>) => Agent {
    const { commandModules, loadCommandModule, defaultCommand } = factoryInput;

    return (input) => {
        const {
            context,
            lumpVariables,
            contextRunState,
            workspacePath,
            runAgentCall,
        } = input;

        const sessionOwners = new Map<string, string>();
        const preparedByName = new Map<string, Promise<PreparedCommand>>();
        let defaultPromptSession: AgentSession | undefined;

        function claim(sessionId: string, commandName: string): void {
            const owner = sessionOwners.get(sessionId);
            if (owner !== undefined && owner !== commandName) {
                throw new Error(`Session ${sessionId} belongs to command ${owner}, not ${commandName}.`);
            }
            sessionOwners.set(sessionId, commandName);
        }

        function lumpModel(): string | undefined {
            return typeof lumpVariables.model === 'string' ? lumpVariables.model : undefined;
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

        async function allocateSessionId(prepared: PreparedCommand, options: SessionOptions): Promise<string> {
            if (prepared.createSession === undefined) return randomUUID();
            const model = options.model ?? lumpModel();
            return prepared.createSession({
                lumpVariables,
                ...(model !== undefined ? { model } : {}),
                workspacePath,
            });
        }

        async function prepareNamed(name: string): Promise<PreparedCommand> {
            const pending = preparedByName.get(name);
            if (pending !== undefined) return pending;

            const loading = (async (): Promise<PreparedCommand> => {
                let mod = commandModules.get(name);
                if (mod === undefined) {
                    mod = await loadCommandModule(name);
                }
                const commandFn = mod.command;
                commandFn.commandName = name;

                let setupSessionId: string | undefined;
                if (mod.setup) {
                    const result = await mod.setup({
                        contextList: [context],
                        lumpVariables,
                        currentContextIndex: 0,
                    });
                    contextRunState[`${name}Setup`] = result?.contextRunState ?? {};
                    if (typeof result?.sessionId === 'string') {
                        setupSessionId = result.sessionId;
                        claim(setupSessionId, name);
                    }
                }

                return {
                    commandFn,
                    commandName: name,
                    ...(mod.createSession !== undefined ? { createSession: mod.createSession } : {}),
                    ...(setupSessionId !== undefined ? { setupSessionId } : {}),
                };
            })();

            preparedByName.set(name, loading);
            try {
                return await loading;
            } catch (error) {
                preparedByName.delete(name);
                throw error;
            }
        }

        async function resolvePrepared(explicit: AgentCommand | undefined): Promise<PreparedCommand> {
            const selected = explicit !== undefined ? explicit : defaultCommand;
            if (typeof selected === 'string') return prepareNamed(selected);
            if (typeof selected === 'function') {
                return {
                    commandFn: selected,
                    commandName: commandNameOf(selected),
                };
            }
            throw new Error('Pass a CommandFn. There is no default command for this workflow.');
        }

        function makeSession(
            prepared: PreparedCommand,
            sessionId: string,
            sessionOptions: PromptOptions,
        ): AgentSession {
            return {
                command: prepared.commandName,
                sessionId,
                prompt(text, callOptions) {
                    const timeoutMillis = callOptions?.timeoutMillis ?? sessionOptions.timeoutMillis;
                    return runAgentCall({
                        commandFn: prepared.commandFn,
                        commandName: prepared.commandName,
                        prompt: text,
                        sessionId,
                        stepVariables: layerStepVariables(sessionOptions, callOptions),
                        ...(timeoutMillis !== undefined ? { timeoutMillis } : {}),
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
            const prepared = await resolvePrepared(command);
            const sessionId = options.sessionId ?? await allocateSessionId(prepared, options);
            claim(sessionId, prepared.commandName);
            return makeSession(prepared, sessionId, promptOptionsOnly(options));
        }

        async function prompt(text: string, options?: PromptOptions): Promise<AgentResult> {
            if (defaultPromptSession === undefined) {
                const prepared = await resolvePrepared(undefined);
                const sessionId = prepared.setupSessionId ?? await allocateSessionId(prepared, {});
                if (prepared.setupSessionId === undefined) {
                    claim(sessionId, prepared.commandName);
                }
                defaultPromptSession = makeSession(prepared, sessionId, {});
            }
            return defaultPromptSession.prompt(text, options);
        }

        return {
            session: openSession,
            prompt,
        };
    };
}
