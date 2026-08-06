import * as path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { PromptFn, SetupFn, Step, TeardownFn } from '@lumpcode/core';

import type { LumpJsConfigStep } from '../../../types';
import {
    assertFailure,
    assertSuccess,
    commandFnCallArgs,
    FIXTURES_DIR,
    GLOBAL_CONFIG_PATH,
    LOCAL_CONFIG_PATH,
    promptFnInput,
    resolveJsConf,
    resolveWithFixtures,
    stubCommandFn,
    stubPromptFn,
} from './testHelpers';

describe('jsConfigToRunLumpInput prompt, command, and steps', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('prompt resolution', () => {
        it('should resolve a prompt template string with variable substitution', async () => {
            const data = assertSuccess(await resolveJsConf({ prompt: 'Refactor @{FILE} to Vue', command: stubCommandFn }));
            const item = data.steps[0] as Step;
            expect(await item.promptFn?.(promptFnInput({ FILE: 'Button.tsx' }))).toBe('Refactor @Button.tsx to Vue');
        });

        it('should preserve unresolved variables in templates', async () => {
            const data = assertSuccess(await resolveJsConf({ prompt: 'Fix {MISSING}', command: stubCommandFn }));
            const item = data.steps[0] as Step;
            expect(await item.promptFn?.(promptFnInput())).toBe('Fix {MISSING}');
        });

        it('should pass through a PromptFn directly', async () => {
            const data = assertSuccess(await resolveJsConf({ prompt: { promptFn: stubPromptFn, commandFn: stubCommandFn } }));
            expect((data.steps[0] as Step).promptFn).toBe(stubPromptFn);
        });

        it('should return a failure when no prompt or steps provided', async () => {
            assertFailure(await resolveJsConf({ prompt: undefined, steps: undefined }),
                'At least one prompt or step must be provided');
        });

        it('should treat a solo steps string like prompt', async () => {
            const data = assertSuccess(await resolveJsConf({ prompt: undefined, steps: 'Refactor @{FILE} to Vue', command: stubCommandFn }));
            const item = data.steps[0] as Step;
            expect(await item.promptFn?.(promptFnInput({ FILE: 'Button.tsx' }))).toBe('Refactor @Button.tsx to Vue');
        });

        it('should treat a solo steps object like prompt', async () => {
            const data = assertSuccess(await resolveJsConf({
                prompt: undefined,
                steps: { promptFn: stubPromptFn, commandFn: stubCommandFn },
            }));
            expect((data.steps[0] as Step).promptFn).toBe(stubPromptFn);
        });

        it('should prefer solo steps over prompt when both are set', async () => {
            const data = assertSuccess(await resolveJsConf({
                prompt: 'From prompt',
                steps: 'From steps',
                command: stubCommandFn,
            }));
            expect(data.steps).toHaveLength(1);
            expect(await (data.steps[0] as Step).promptFn?.(promptFnInput())).toBe('From steps');
        });

        it('should treat a solo dynamic steps function as a steps expander', async () => {
            const recursiveFn = vi.fn(async () => ['Solo dynamic for {FILE}']);
            const data = assertSuccess(await resolveJsConf({
                command: stubCommandFn,
                prompt: undefined,
                steps: recursiveFn,
            }));
            expect(data.steps).toHaveLength(1);
            expect(typeof data.steps[0]).toBe('function');

            const subItems = await (data.steps[0] as Function)({
                context: { name: 'ctx', variables: { FILE: 'app.ts' } },
                stepIndex: [0],
                contextRunState: {},
                lumpVariables: {},
            }) as Step[];
            expect(subItems).toHaveLength(1);
            expect(await subItems[0].promptFn?.(promptFnInput({ FILE: 'app.ts' }))).toBe('Solo dynamic for app.ts');
            expect(subItems[0].commandFn).toBe(stubCommandFn);
            expect(recursiveFn).toHaveBeenCalledOnce();
        });

        it('should expand a dynamic steps function that returns a solo step object', async () => {
            const recursiveFn = vi.fn(async () => ({
                promptTemplate: 'Solo object for {FILE}',
            }));
            const data = assertSuccess(await resolveJsConf({
                command: stubCommandFn,
                prompt: undefined,
                steps: [recursiveFn],
            }));
            const subItems = await (data.steps[0] as Function)(promptFnInput({ FILE: 'lib.ts' })) as Step[];
            expect(subItems).toHaveLength(1);
            expect(await subItems[0].promptFn?.(promptFnInput({ FILE: 'lib.ts' }))).toBe('Solo object for lib.ts');
            expect(subItems[0].commandFn).toBe(stubCommandFn);
            expect(recursiveFn).toHaveBeenCalledOnce();
        });

        it('should resolve a step with commandFn only and no prompt fields', async () => {
            const data = assertSuccess(await resolveJsConf({
                prompt: undefined,
                steps: [{ commandFn: stubCommandFn } as LumpJsConfigStep],
            }));
            const item = data.steps[0] as Step;
            expect(item.promptFn).toBeUndefined();
            expect(item.commandFn).toBe(stubCommandFn);
        });
    });

    describe('command resolution', () => {
        it('should pass through a CommandFn directly', async () => {
            const data = assertSuccess(await resolveJsConf({ prompt: { promptFn: stubPromptFn, commandFn: stubCommandFn } }));
            expect((data.steps[0] as Step).commandFn).toBe(stubCommandFn);
        });

        it('should use default command for prompt items without their own', async () => {
            const data = assertSuccess(await resolveJsConf({ command: stubCommandFn, prompt: 'Do something' }));
            expect((data.steps[0] as Step).commandFn).toBe(stubCommandFn);
        });

        it('should resolve a command string to a local command module file', async () => {
            const data = assertSuccess(await resolveWithFixtures({ command: 'test-agent', prompt: 'Do something' }));
            const item = data.steps[0] as Step;
            expect(item.commandFn?.commandName).toBe('test-agent');
            expect(await item.commandFn?.(commandFnCallArgs)).toEqual({ executable: 'local-agent', args: ['--local'] });
        });

        it('should fall back to the global command when local is missing', async () => {
            const data = assertSuccess(await resolveJsConf(
                { command: 'test-agent', prompt: 'Do something' },
                { localConfigFolderPath: path.join(FIXTURES_DIR, 'nonexistent-local'), globalConfigFolderPath: GLOBAL_CONFIG_PATH },
            ));
            expect(await (data.steps[0] as Step).commandFn?.(commandFnCallArgs)).toEqual({ executable: 'global-agent', args: ['--global'] });
        });
    });

    describe('steps resolution', () => {
        it('should resolve multiple string templates with default command', async () => {
            const data = assertSuccess(await resolveJsConf({ command: stubCommandFn, prompt: undefined, steps: ['Fix {FILE}', 'Test {FILE}'] }));
            expect(data.steps).toHaveLength(2);
            const [item0, item1] = data.steps as Step[];
            expect(await item0.promptFn?.(promptFnInput({ FILE: 'app.ts' }))).toBe('Fix app.ts');
            expect(await item1.promptFn?.(promptFnInput({ FILE: 'app.ts' }))).toBe('Test app.ts');
            expect(item0.commandFn).toBe(stubCommandFn);
            expect(item1.commandFn).toBe(stubCommandFn);
        });

        it('should resolve mixed prompt items: strings and full objects', async () => {
            const customPromptFn: PromptFn = () => 'dynamic prompt';
            const data = assertSuccess(await resolveJsConf({
                command: stubCommandFn,
                prompt: undefined,
                steps: [
                    'Simple template',
                    { promptFn: customPromptFn, commandFn: stubCommandFn } as LumpJsConfigStep,
                ],
            }));
            expect(data.steps).toHaveLength(2);
            const [item0, item1] = data.steps as Step[];
            expect(await item0.promptFn?.(promptFnInput())).toBe('Simple template');
            expect(item1.promptFn).toBe(customPromptFn);
        });

        it('should allow per-item command override alongside default command', async () => {
            const data = assertSuccess(await resolveWithFixtures({
                command: 'test-agent',
                prompt: undefined,
                steps: [
                    'Use default command',
                    { promptTemplate: 'Use override command', command: 'second-agent' } as LumpJsConfigStep,
                ],
            }));
            const [item0, item1] = data.steps as Step[];
            expect(item0.commandFn?.commandName).toBe('test-agent');
            expect(item1.commandFn?.commandName).toBe('second-agent');
            expect((await item0.commandFn?.(commandFnCallArgs))?.executable).toBe('local-agent');
            expect((await item1.commandFn?.(commandFnCallArgs))?.executable).toBe('second-agent');
        });

        it('should resolve each command module only once when shared across items', async () => {
            const data = assertSuccess(await resolveWithFixtures({ command: 'test-agent', prompt: undefined, steps: ['Step 1', 'Step 2'] }));
            const [item0, item1] = data.steps as Step[];
            expect(item0.commandFn).toBe(item1.commandFn);
        });

        it('should register all distinct command setups and teardowns', async () => {
            const userSetupFn: SetupFn = vi.fn().mockResolvedValue({ contextRunState: { userKey: 'userValue' } });
            const userTeardownFn: TeardownFn = vi.fn().mockResolvedValue(undefined);

            const data = assertSuccess(await resolveWithFixtures({
                setupFn: userSetupFn,
                teardownFn: userTeardownFn,
                command: 'test-agent',
                prompt: undefined,
                steps: [
                    'Step 1',
                    { promptTemplate: 'Step 2', command: 'second-agent' } as LumpJsConfigStep,
                ],
            }));

            const setupResult = await data.setupFn!({
                contextList: [],
                lumpVariables: {},
                currentContextIndex: 0,
            });
            expect(userSetupFn).toHaveBeenCalledOnce();
            expect(setupResult?.contextRunState).toEqual({
                userKey: 'userValue',
                'test-agentSetup': { source: 'local' },
                'second-agentSetup': { source: 'second' },
            });

            await expect(data.teardownFn!({ lumpVariables: {}, contextList: [], contextRunState: {}, currentContextIndex: 0 })).resolves.toBeUndefined();
            expect(userTeardownFn).toHaveBeenCalledOnce();
        });
    });

    describe('file-backed hooks', () => {
        const hooksDir = path.join(LOCAL_CONFIG_PATH, 'hooks');

        it('should resolve setupFn and teardownFn from FilePath', async () => {
            const data = assertSuccess(await resolveWithFixtures({
                setupFn: path.join(hooksDir, 'setup.js'),
                teardownFn: path.join(hooksDir, 'teardown.js'),
                command: stubCommandFn,
                prompt: 'Hello',
            }));

            const setupResult = await data.setupFn!({
                contextList: [{ name: 'ctx', variables: {} }],
                lumpVariables: {},
                currentContextIndex: 0,
            });
            expect(setupResult?.contextRunState).toMatchObject({ fromSetupHook: true });
            await expect(
                data.teardownFn!({
                    contextList: [{ name: 'ctx', variables: {} }],
                    lumpVariables: {},
                    contextRunState: {},
                    currentContextIndex: 0,
                }),
            ).resolves.toBeUndefined();
        });

        it('should resolve postCommandExecFn from FilePath on prompt item', async () => {
            const data = assertSuccess(await resolveWithFixtures({
                command: stubCommandFn,
                prompt: {
                    promptTemplate: 'Hi',
                    commandFn: stubCommandFn,
                    postCommandExecFn: path.join(hooksDir, 'postCommandExec.js'),
                } as LumpJsConfigStep,
            }));
            const item = data.steps[0] as Step;
            expect(item.postCommandExecFn).toBeTypeOf('function');
        });

        it('wraps postCommandExecFn so solo returned steps resolve to core Steps', async () => {
            const data = assertSuccess(await resolveJsConf({
                command: stubCommandFn,
                prompt: undefined,
                steps: [{
                    commandFn: stubCommandFn,
                    postCommandExecFn: ({ commandSucceeded }) => {
                        if (commandSucceeded) {
                            return {
                                commandFn: () => ({ executable: 'echo', args: ['done'] }),
                            };
                        }
                    },
                }],
            }));
            const item = data.steps[0] as Step;
            const returned = await item.postCommandExecFn!({
                commandResult: '',
                commandSucceeded: true,
                context: { name: 'ctx', variables: {} },
                prompt: '',
                stepIndex: 0,
                contextRunState: {},
                lumpVariables: {},
                projectRoot: '/tmp',
            });
            expect(Array.isArray(returned)).toBe(true);
            expect(returned).toHaveLength(1);
            expect(typeof (returned![0] as Step).commandFn).toBe('function');
            const command = await (returned![0] as Step).commandFn!({
                context: { name: 'ctx', variables: {} },
                prompt: '',
                stepIndex: [0, 0],
                contextRunState: {},
                lumpVariables: {},
                projectRoot: '/tmp',
                workspacePath: '/tmp',
            });
            expect(command).toEqual({ executable: 'echo', args: ['done'] });
        });
    });
});
