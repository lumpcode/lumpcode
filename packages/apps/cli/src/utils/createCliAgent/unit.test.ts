import { appendFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { CommandFn, ContextRunState, CreateAgentInput, LumpVariables, StepVariables } from '@lumpcode/core';

import type { CommandModule } from '../../types/CommandModule';
import { createCliAgent } from './main';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ArgvRecord = {
    command: string;
    prompt: string;
    sessionId?: string;
    stepVariables?: StepVariables;
};

type TeardownParams = Parameters<NonNullable<CommandModule['teardown']>>[0];

// Skipped until the agent-sessions implementation. Unskip this block; do not rewrite it.
describe.skip('createCliAgent', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'cli-agent-'));
    });

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    function argvPath(): string {
        return join(dir, 'argv.jsonl');
    }

    function fixtureCommand(commandName: string): CommandFn {
        const command: CommandFn = async ({ prompt, sessionId, stepVariables }) => {
            const record: ArgvRecord = {
                command: commandName,
                prompt,
                ...(sessionId !== undefined ? { sessionId } : {}),
                ...(stepVariables !== undefined ? { stepVariables } : {}),
            };
            await appendFile(argvPath(), `${JSON.stringify(record)}\n`);
            return { executable: 'echo', args: ['ok'] };
        };
        command.commandName = commandName;
        return command;
    }

    async function readArgv(): Promise<ArgvRecord[]> {
        const text = await readFile(argvPath(), 'utf8');
        return text.split('\n').filter((line) => line.length > 0).map((line) => JSON.parse(line) as ArgvRecord);
    }

    function openAgent(input: {
        catalog: Map<string, CommandModule>;
        defaultCommand?: string | CommandFn;
        lumpVariables?: LumpVariables;
    }) {
        const commandModules = new Map<string, CommandModule>();
        const loaded: string[] = [];
        const context = { name: 'ctx', variables: {} };
        const lumpVariables = input.lumpVariables ?? { model: 'lump-model' };
        const contextRunState: ContextRunState = {};
        const calls: Array<{ commandName: string; sessionId: string; stepVariables: StepVariables }> = [];

        const agent = createCliAgent({
            commandModules,
            defaultCommand: input.defaultCommand,
            loadCommandModule: async (commandName) => {
                loaded.push(commandName);
                const mod = input.catalog.get(commandName);
                if (mod === undefined) {
                    throw new Error(`Command module not found: ${commandName}`);
                }
                commandModules.set(commandName, mod);
                return mod;
            },
        })({
            context,
            lumpVariables,
            contextRunState,
            projectRoot: dir,
            workspacePath: dir,
            runAgentCall: async (call) => {
                calls.push({
                    commandName: call.commandName,
                    sessionId: call.sessionId,
                    stepVariables: call.stepVariables,
                });
                await call.commandFn({
                    context,
                    prompt: call.prompt,
                    stepIndex: [0, calls.length],
                    contextRunState,
                    lumpVariables,
                    stepVariables: call.stepVariables,
                    projectRoot: dir,
                    workspacePath: dir,
                    sessionId: call.sessionId,
                });
                return { output: 'ok', succeeded: true, exitCode: 0, timedOut: false };
            },
        } satisfies CreateAgentInput);

        return { agent, commandModules, loaded, calls, contextRunState, lumpVariables, context };
    }

    async function teardownUsed(input: {
        commandModules: Map<string, CommandModule>;
        lumpVariables: LumpVariables;
        contextRunState: ContextRunState;
        context: { name: string; variables: Record<string, never> };
    }): Promise<void> {
        const params: TeardownParams = {
            lumpVariables: input.lumpVariables,
            contextList: [input.context],
            contextRunState: input.contextRunState,
            currentContextIndex: 0,
        };
        for (const mod of input.commandModules.values()) {
            await mod.teardown?.(params);
        }
    }

    it('opens a session from a tag, from options.command, from a command function, or from the default command', async () => {
        const alpha = fixtureCommand('alpha');
        const beta = fixtureCommand('beta');
        const custom = fixtureCommand('custom');
        let alphaN = 0;
        let betaN = 0;
        const catalog = new Map<string, CommandModule>([
            ['alpha', { command: alpha, createSession: async () => `alpha-${++alphaN}` }],
            ['beta', { command: beta, createSession: async () => `beta-${++betaN}` }],
        ]);
        const { agent, loaded } = openAgent({ catalog, defaultCommand: 'alpha' });

        const byTag = await agent.session('beta');
        const byOption = await agent.session({ command: 'beta' });
        const byFunction = await agent.session(custom);
        const byDefault = await agent.session();

        expect(byTag).toMatchObject({ command: 'beta', sessionId: 'beta-1' });
        expect(byOption).toMatchObject({ command: 'beta', sessionId: 'beta-2' });
        expect(byFunction.command).toBe('custom');
        expect(byFunction.sessionId).toMatch(UUID);
        expect(byDefault).toMatchObject({ command: 'alpha', sessionId: 'alpha-1' });
        expect(loaded).toEqual(['beta', 'alpha']);
    });

    it('rejects a command passed both as the first argument and as options.command', async () => {
        const alpha = fixtureCommand('alpha');
        const { agent, loaded } = openAgent({
            catalog: new Map([['alpha', { command: alpha }]]),
            defaultCommand: 'alpha',
        });

        await expect(agent.session('alpha', { command: 'alpha' })).rejects.toThrow(
            'Pass the command once: as the first argument or as options.command.',
        );
        await expect(agent.session(alpha, { command: alpha })).rejects.toThrow(
            'Pass the command once: as the first argument or as options.command.',
        );
        expect(loaded).toEqual([]);
    });

    it('loads a command and runs its setup once, then keeps that module', async () => {
        let setups = 0;
        const alpha = fixtureCommand('alpha');
        const catalog = new Map<string, CommandModule>([[
            'alpha',
            {
                command: alpha,
                setup: () => {
                    setups += 1;
                    return {
                        sessionId: 'from-setup',
                        contextRunState: { setupChatId: 'from-setup', chatsIds: { '0': 'from-setup' } },
                    };
                },
                createSession: async () => `created-${setups}`,
            },
        ]]);
        const { agent, loaded, contextRunState } = openAgent({ catalog, defaultCommand: 'alpha' });

        await agent.session('alpha');
        await agent.session('alpha');
        await agent.prompt('one');

        expect(setups).toBe(1);
        expect(loaded).toEqual(['alpha']);
        expect(contextRunState.alphaSetup).toEqual({
            setupChatId: 'from-setup',
            chatsIds: { '0': 'from-setup' },
        });
    });

    it('uses setup sessionId for agent.prompt and createSession for a new session', async () => {
        const created: Array<{ lumpVariables: LumpVariables; model?: string; workspacePath: string }> = [];
        const alpha = fixtureCommand('alpha');
        const lumpVariables = { model: 'lump-model', agentPermissions: { tier: 'lump' } };
        const catalog = new Map<string, CommandModule>([[
            'alpha',
            {
                command: alpha,
                setup: () => ({
                    sessionId: 'from-setup',
                    contextRunState: { setupChatId: 'from-setup' },
                }),
                createSession: async (input) => {
                    created.push(input);
                    return `created-${created.length}`;
                },
            },
        ]]);
        const { agent } = openAgent({ catalog, defaultCommand: 'alpha', lumpVariables });

        const opened = await agent.session({ model: 'session-model' });
        await agent.prompt('one');
        await agent.prompt('two');
        const plain = await agent.session();

        expect(opened.sessionId).toBe('created-1');
        expect(created[0]).toEqual({
            lumpVariables,
            model: 'session-model',
            workspacePath: dir,
        });
        expect(plain.sessionId).toBe('created-2');
        expect(created[1]).toMatchObject({ model: 'lump-model', workspacePath: dir });
        const argv = await readArgv();
        expect(argv.map((record) => record.sessionId)).toEqual(['from-setup', 'from-setup']);
        expect(argv.map((record) => record.prompt)).toEqual(['one', 'two']);
    });

    it('gives a preset without createSession a UUID sessionId and still runs it', async () => {
        const alpha = fixtureCommand('alpha');
        const { agent } = openAgent({
            catalog: new Map([['alpha', { command: alpha }]]),
            defaultCommand: 'alpha',
        });

        const session = await agent.session();
        expect(session.sessionId).toMatch(UUID);
        await session.prompt('hi');

        const argv = await readArgv();
        expect(argv).toEqual([
            { command: 'alpha', prompt: 'hi', sessionId: session.sessionId },
        ]);
    });

    it('refuses a session id that this run already gave to another command', async () => {
        const catalog = new Map<string, CommandModule>([
            ['alpha', { command: fixtureCommand('alpha'), createSession: async () => 'alpha-session' }],
            ['beta', { command: fixtureCommand('beta'), createSession: async () => 'beta-session' }],
        ]);
        const { agent } = openAgent({ catalog, defaultCommand: 'alpha' });
        const session = await agent.session('alpha');

        const again = await agent.session('alpha', { sessionId: session.sessionId });
        expect(again.sessionId).toBe(session.sessionId);

        await expect(agent.session('beta', { sessionId: session.sessionId })).rejects.toThrow(
            'Session alpha-session belongs to command alpha, not beta.',
        );
    });

    it('passes an unknown session id through to the command', async () => {
        const alpha = fixtureCommand('alpha');
        let created = 0;
        const { agent } = openAgent({
            catalog: new Map([[
                'alpha',
                {
                    command: alpha,
                    createSession: async () => {
                        created += 1;
                        return 'created';
                    },
                },
            ]]),
            defaultCommand: 'alpha',
        });

        const session = await agent.session({ sessionId: 'from-earlier-run' });
        expect(session.sessionId).toBe('from-earlier-run');
        await session.prompt('resume');

        expect(created).toBe(0);
        expect(await readArgv()).toEqual([
            { command: 'alpha', prompt: 'resume', sessionId: 'from-earlier-run' },
        ]);
    });

    it('sends a later prompt to the same session when sessionId is reused', async () => {
        const alpha = fixtureCommand('alpha');
        const { agent, calls } = openAgent({
            catalog: new Map([['alpha', { command: alpha, createSession: async () => 'chat-1' }]]),
            defaultCommand: 'alpha',
        });

        const session = await agent.session('alpha');
        await session.prompt('first');
        const again = await agent.session({ sessionId: session.sessionId });
        await again.prompt('second');

        expect(again.sessionId).toBe('chat-1');
        expect(await readArgv()).toEqual([
            { command: 'alpha', prompt: 'first', sessionId: 'chat-1' },
            { command: 'alpha', prompt: 'second', sessionId: 'chat-1' },
        ]);
        expect(calls.map((call) => call.commandName)).toEqual(['alpha', 'alpha']);
    });

    it('layers prompt options lump, then session, then call', async () => {
        const alpha = fixtureCommand('alpha');
        const { agent } = openAgent({
            catalog: new Map([['alpha', { command: alpha, createSession: async () => 'chat-1' }]]),
            defaultCommand: 'alpha',
            lumpVariables: {
                model: 'lump',
                extraArgs: ['--lump'],
                agentPermissions: { tier: 'lump' },
            },
        });

        const session = await agent.session({
            model: 'session',
            extraArgs: ['--session'],
            permissions: { tier: 'session' },
        });
        await session.prompt('hi', { model: 'call' });

        const argv = await readArgv();
        expect(argv[0]?.stepVariables).toEqual({
            model: 'call',
            extraArgs: ['--session'],
            agentPermissions: { tier: 'session' },
        });
    });

    it('tears down each used command and does not load an unused one', async () => {
        const tornDown: string[] = [];
        function tracked(name: string): CommandModule {
            return {
                command: fixtureCommand(name),
                createSession: async () => `${name}-session`,
                teardown: () => {
                    tornDown.push(name);
                },
            };
        }
        const catalog = new Map<string, CommandModule>([
            ['alpha', tracked('alpha')],
            ['beta', tracked('beta')],
            ['gamma', tracked('gamma')],
        ]);
        const opened = openAgent({ catalog, defaultCommand: 'alpha' });

        await opened.agent.session('alpha');
        await (await opened.agent.session('beta')).prompt('hi');
        await teardownUsed(opened);

        expect(opened.loaded).toEqual(['alpha', 'beta']);
        expect([...opened.commandModules.keys()]).toEqual(['alpha', 'beta']);
        expect(tornDown).toEqual(['alpha', 'beta']);
    });
});
