import { createHash } from 'node:crypto';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { CommandFn, GetContextListFn, PromptFn, Step, SetupFn, TeardownFn } from '@lumpcode/core';
import { runLump, shellBestEffort, shellSingleQuote } from '@lumpcode/core';

import type { ContextMatchFn, LumpJsConfig, LumpJsConfigStep, LumpJsConfigSteps } from '../../types';
import { jsConfigToRunLumpInput } from './main';
import { LUMP_BRANCH_PREFIX, LUMP_COMMIT_PREFIX } from '../../consts';

const FIXTURES_DIR = path.resolve(__dirname, '__fixtures__');
const LOCAL_CONFIG_PATH = path.join(FIXTURES_DIR, 'local-config');
const GLOBAL_CONFIG_PATH = path.join(FIXTURES_DIR, 'global-config');

const DEFAULT_TEST_LOCAL_CONFIG = path.join('/tmp', 'project', '.lumpcode');
const DEFAULT_TEST_GLOBAL_CONFIG = path.join('/tmp', 'project', '.lumpcode-global-fixture');
const DEFAULT_TEST_WORKSPACE = path.join('/tmp', 'project');
const DEFAULT_TEST_PROJECT_BASE_BRANCH = 'main';

const stubCommandFn: CommandFn = () => ({ executable: 'test-cli', args: ['-p'] });
const stubGetContextListFn: GetContextListFn = () => [{ name: 'ctx1', variables: { FILE: 'a.ts' } }];
const stubPromptFn: PromptFn = () => 'do something';

function initTestGitRepo(projectRoot: string) {
    execSync(
        'git init && git config user.email "test@test.com" && git config user.name "Test" && git commit --allow-empty -m "init"',
        { cwd: projectRoot, stdio: 'pipe' },
    );
}

function makeConfig(overrides: Partial<LumpJsConfig> = {}): LumpJsConfig {
    return {
        getContextListFn: stubGetContextListFn,
        prompt: { promptFn: stubPromptFn, commandFn: stubCommandFn },
        ...overrides,
    } as LumpJsConfig;
}

function resolveJsConf(
    configOverrides: Partial<LumpJsConfig>,
    opts: {
        lumpName?: string;
        localConfigFolderPath?: string;
        globalConfigFolderPath?: string;
        projectBaseBranch?: string;
        executionWorkspacePath?: string;
        workspaceStrategy?: 'checkout' | 'worktree';
    } = {},
) {
    return jsConfigToRunLumpInput({
        config: makeConfig(configOverrides),
        lumpName: opts.lumpName ?? 'my-lump',
        localConfigFolderPath: opts.localConfigFolderPath ?? DEFAULT_TEST_LOCAL_CONFIG,
        globalConfigFolderPath: opts.globalConfigFolderPath ?? DEFAULT_TEST_GLOBAL_CONFIG,
        projectBaseBranch: opts.projectBaseBranch ?? DEFAULT_TEST_PROJECT_BASE_BRANCH,
        executionWorkspacePath: opts.executionWorkspacePath ?? DEFAULT_TEST_WORKSPACE,
        workspaceStrategy: opts.workspaceStrategy ?? 'checkout',
    });
}

function resolveWithFixtures(
    configOverrides: Partial<LumpJsConfig>,
    opts: { lumpName?: string } = {},
) {
    return resolveJsConf(configOverrides, {
        ...opts,
        localConfigFolderPath: LOCAL_CONFIG_PATH,
        globalConfigFolderPath: GLOBAL_CONFIG_PATH,
    });
}

function promptFnInput(variables: Record<string, string> = {}) {
    return { context: { name: 'ctx', variables }, stepIndex: 0, contextRunState: {}, lumpVariables: {} };
}

const commandFnCallArgs = {
    context: { name: 'ctx', variables: {} },
    prompt: 'test',
    stepIndex: 0,
    contextRunState: {},
    lumpVariables: {},
    projectRoot: '/tmp',
    workspacePath: '/tmp',
} as const;

function assertSuccess<T>(result: { success: true; data: T } | { success: false; data: string }): T {
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unreachable');
    return result.data;
}

function assertFailure(result: { success: true; data: unknown } | { success: false; data: string }, expected: string): void {
    expect(result.success).toBe(false);
    if (result.success) throw new Error('unreachable');
    expect(result.data).toBe(expected);
}

describe('jsConfigToRunLumpInput', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should produce a valid RunLumpInput from a minimal config (baseBranch from projectBaseBranch)', async () => {
        const data = assertSuccess(await resolveJsConf({}));
        expect(data.baseBranch).toBe('main');
        expect(data.projectRoot).toBe('/tmp/project');
        expect(data.steps).toHaveLength(1);
        expect(typeof data.branchFn).toBe('function');
        expect(typeof data.getContextListFn).toBe('function');
        expect(typeof data.setupFn).toBe('function');
        expect(typeof data.teardownFn).toBe('function');
        expect(typeof data.setupWorkspaceFn).toBe('function');
        expect(typeof data.teardownWorkspaceFn).toBe('function');
    });

    it('should let lump-level baseBranch override projectBaseBranch', async () => {
        const data = assertSuccess(
            await resolveJsConf({ baseBranch: 'release/2.0' }, { projectBaseBranch: 'main' }),
        );
        expect(data.baseBranch).toBe('release/2.0');
    });

    describe('auto-generated setupWorkspaceFn / teardownWorkspaceFn', () => {
        it('returns branch workspace equal to execution workspace (checkout) and builds the per-lump git command from baseBranch + branchName', async () => {
            const data = assertSuccess(
                await resolveJsConf({}, { executionWorkspacePath: '/wkspace', projectBaseBranch: 'main' }),
            );

            const setupOut = await data.setupWorkspaceFn!({
                baseBranch: 'main',
                branchName: 'lump/foo/ctx',
                contextList: [{ name: 'ctx', variables: {} }],
            });
            expect(setupOut.workspacePath).toBe(path.resolve('/wkspace'));
            expect(setupOut.command).toContain(`cd '/wkspace'`);
            expect(setupOut.command).toContain('git fetch origin main');
            expect(setupOut.command).toContain('git switch main');
            expect(setupOut.command).toContain('git reset --hard origin/main');
            expect(setupOut.command).toContain('git pull origin main');
            expect(setupOut.command).toContain(shellBestEffort(`git branch -D ${shellSingleQuote('lump/foo/ctx')}`));
            expect(setupOut.command).toContain(`git switch -c ${shellSingleQuote('lump/foo/ctx')}`);
        });

        it('teardown always returns to projectBaseBranch (not the lump-level baseBranch)', async () => {
            const data = assertSuccess(
                await resolveJsConf(
                    { baseBranch: 'release/2.0' },
                    { projectBaseBranch: 'main', executionWorkspacePath: '/wkspace' },
                ),
            );
            const teardownCmd = await data.teardownWorkspaceFn!({
                baseBranch: 'release/2.0',
                branchName: 'lump/foo/ctx',
                contextList: [{ name: 'ctx', variables: {} }],
                workspacePath: '/wkspace',
            });
            expect(teardownCmd).toContain(`cd '/wkspace'`);
            expect(teardownCmd).toContain('git switch main');
        });

        it('setup uses the lump-level baseBranch in its git commands', async () => {
            const data = assertSuccess(
                await resolveJsConf(
                    { baseBranch: 'release/2.0' },
                    { projectBaseBranch: 'main', executionWorkspacePath: '/wkspace' },
                ),
            );
            const setupOut = await data.setupWorkspaceFn!({
                baseBranch: 'release/2.0',
                branchName: 'lump/foo/ctx',
                contextList: [{ name: 'ctx', variables: {} }],
            });
            expect(setupOut.workspacePath).toBe(path.resolve('/wkspace'));
            expect(setupOut.command).toContain('git fetch origin release/2.0');
            expect(setupOut.command).toContain('git pull origin release/2.0');
        });

        it('worktree strategy returns worktree path and worktree add command', async () => {
            const data = assertSuccess(
                await resolveJsConf({}, { executionWorkspacePath: '/wkspace', workspaceStrategy: 'worktree' }),
            );
            const setupOut = await data.setupWorkspaceFn!({
                baseBranch: 'main',
                branchName: 'lump/foo/ctx',
                contextList: [{ name: 'ctx', variables: {} }],
            });
            expect(setupOut.workspacePath).toBe(
                path.join(path.resolve('/wkspace'), '.lumpcode', 'worktrees', 'lump', 'foo', 'ctx'),
            );
            expect(setupOut.command).toContain(`cd '/wkspace'`);
            expect(setupOut.command).toContain(`worktree add -B ${shellSingleQuote('lump/foo/ctx')}`);
            expect(setupOut.command).toContain(shellSingleQuote('origin/main'));
        });
    });

    describe('gitCommitMessageFn', () => {
        it('should namespace commit messages with lumpName', async () => {
            const data = assertSuccess(await resolveJsConf({}, { lumpName: 'migrate-vue' }));
            expect(data.gitCommitMessageFn!({
                context: { name: 'button', variables: {} },
                lumpVariables: {},
                baseBranch: 'main',
            })).toBe(`${LUMP_COMMIT_PREFIX}migrate-vue - button`);
        });

        it('should resolve cross-lump dependsOn markers from lumpName/contextName', async () => {
            const data = assertSuccess(await resolveJsConf({}, { lumpName: 'consumer' }));
            expect(data.gitCommitMessageFn!({
                context: { name: 'depLump/README', variables: {} },
                lumpVariables: {},
                baseBranch: 'main',
            })).toBe(`${LUMP_COMMIT_PREFIX}depLump - README`);
        });
    });

    describe('keepHistory', () => {
        const ctx = { name: 'ctx', variables: {} };

        it('returns undefined when keepHistory is omitted', async () => {
            const data = assertSuccess(await resolveJsConf({}));
            expect(data.getKeepHistoryFilePathFn!(ctx)).toBeUndefined();
        });

        it('returns undefined when keepHistory is false', async () => {
            const data = assertSuccess(await resolveJsConf({ keepHistory: false }));
            expect(data.getKeepHistoryFilePathFn!(ctx)).toBeUndefined();
        });

        it('returns the per-context history path when keepHistory is true', async () => {
            const lumpName = 'my-lump';
            const data = assertSuccess(await resolveJsConf({ keepHistory: true }, { lumpName }));
            expect(data.getKeepHistoryFilePathFn!(ctx)).toBe(
                path.join('/tmp/project', '.lumpcode', 'lumps', lumpName, 'history', 'ctx.json'),
            );
        });
    });

    describe('branchFn resolution', () => {
        const branchFnInput = (contextName: string) => ({
            contextList: [{ name: contextName, variables: {} }],
            contextRunStateList: [{}],
            lumpVariables: {},
        });

        it('should use the branch name based on lumpName', async () => {
            const data = assertSuccess(await resolveJsConf(
                {},
                { lumpName: 'refactor' },
            ));
            expect(await data.branchFn(branchFnInput('header'))).toBe(`${LUMP_BRANCH_PREFIX}refactor/header`);
        });

        it('should use a stable hash suffix when multiple contexts share one branch', async () => {
            const data = assertSuccess(await resolveJsConf({}, { lumpName: 'refactor' }));
            const names = ['header', 'footer'];
            const hash = createHash('sha256').update([...names].sort().join('\0')).digest('hex').slice(0, 12);
            const multiContextInput = {
                contextList: names.map((name) => ({ name, variables: {} })),
                contextRunStateList: [{}, {}],
                lumpVariables: {},
            };
            expect(await data.branchFn(multiContextInput)).toBe(`${LUMP_BRANCH_PREFIX}refactor/${hash}`);
            expect(await data.branchFn({
                ...multiContextInput,
                contextList: [...multiContextInput.contextList].reverse(),
            })).toBe(`${LUMP_BRANCH_PREFIX}refactor/${hash}`);
        });
    });

    describe('getContextListFn resolution', () => {
        it('should pass through a function getContextListFn', async () => {
            const data = assertSuccess(await resolveJsConf({ getContextListFn: stubGetContextListFn }));
            expect(data.getContextListFn).toBe(stubGetContextListFn);
        });

        it('should resolve getContextListFn from a relative FilePath in the lump folder', async () => {
            const data = assertSuccess(await resolveWithFixtures({
                getContextListFn: './getContextList.js',
                contextMatchFn: undefined,
                contextListJson: undefined,
            }));
            const contexts = await data.getContextListFn({
                codeBasePaths: [],
                lumpVariables: {},
            });
            expect(contexts).toEqual([{ name: 'from-file', variables: { FILE: 'via-relative-path.ts' } }]);
        });

        it('should return a failure when neither getContextListFn nor contextMatchFn nor contextListJson is provided', async () => {
            assertFailure(await resolveJsConf({ getContextListFn: undefined, contextMatchFn: undefined, contextListJson: undefined }),
                'Either getContextListFn, contextMatchFn, or contextListJson must be provided');
        });

        it('should create getContextListFn from inline contextListJson template', async () => {
            const template = {
                FOLDER: 'src/components/{COMPONENT_NAME}/',
                INDEX: 'src/components/{COMPONENT_NAME}/index.ts',
            };
            const data = assertSuccess(await resolveJsConf({
                getContextListFn: undefined,
                contextMatchFn: undefined,
                contextListJson: template,
            }));
            const contexts = await data.getContextListFn({
                codeBasePaths: [
                    { isDir: true, path: 'src/components/button' },
                    { isDir: false, path: 'src/components/button/index.ts' },
                    { isDir: true, path: 'src/components/form' },
                    { isDir: false, path: 'src/components/form/index.ts' },
                ],
                lumpVariables: {},
            });
            expect(contexts).toHaveLength(2);
            expect(contexts[0]).toEqual({
                name: 'button',
                variables: { FOLDER: 'src/components/button/', INDEX: 'src/components/button/index.ts' },
            });
            expect(contexts[1]).toEqual({
                name: 'form',
                variables: { FOLDER: 'src/components/form/', INDEX: 'src/components/form/index.ts' },
            });
        });

        it('should create getContextListFn from contextListJson file path', async () => {
            const data = assertSuccess(await resolveWithFixtures({
                getContextListFn: undefined,
                contextMatchFn: undefined,
                contextListJson: './contextList.json',
            }));
            const contexts = await data.getContextListFn({
                codeBasePaths: [
                    { isDir: true, path: 'src/components/button' },
                    { isDir: false, path: 'src/components/button/index.ts' },
                    { isDir: true, path: 'src/components/form' },
                    { isDir: false, path: 'src/components/form/index.ts' },
                ],
                lumpVariables: {},
            });
            expect(contexts).toHaveLength(2);
            expect(contexts[0]).toEqual({
                name: 'button',
                variables: { FOLDER: 'src/components/button/', INDEX: 'src/components/button/index.ts' },
            });
            expect(contexts[1]).toEqual({
                name: 'form',
                variables: { FOLDER: 'src/components/form/', INDEX: 'src/components/form/index.ts' },
            });
        });

        it('should adapt contextMatchFn to getContextListFn and map object return to Context', async () => {
            const inputCodeBasePaths = [
                { isDir: false, path: '/src/Button.ts' },
                { isDir: false, path: '/src/readme.md' },
                { isDir: false, path: '/src/Input.ts' },
            ];
            const receivedCodeBasePaths: typeof inputCodeBasePaths[] = [];
            const contextMatchFn: ContextMatchFn = ({ codeBasePath, codeBasePaths, lumpVariables }) => {
                receivedCodeBasePaths.push(codeBasePaths);
                expect(codeBasePaths).toBe(inputCodeBasePaths);
                if (!codeBasePath.path.endsWith('.ts')) return null;
                return {
                    contextName: codeBasePath.path.replace(/^\/src\//, '').replace(/\.ts$/, ''),
                    filePathVariableName: 'FILE',
                    moreContextVariables: { EXTRA: (lumpVariables as { lang?: string }).lang ?? 'ts' },
                    contextOptions: { priority: 1 },
                };
            };
            const data = assertSuccess(await resolveJsConf({
                getContextListFn: undefined,
                contextMatchFn,
                lumpVariables: { lang: 'typescript' },
            }));
            const contexts = await data.getContextListFn({
                codeBasePaths: inputCodeBasePaths,
                lumpVariables: { lang: 'typescript' },
            });
            expect(receivedCodeBasePaths).toHaveLength(3);
            expect(contexts).toHaveLength(2);
            expect(contexts).toEqual(expect.arrayContaining([
                {
                    name: 'Button',
                    variables: { FILE: '/src/Button.ts', EXTRA: 'typescript' },
                    options: { priority: 1 },
                },
                {
                    name: 'Input',
                    variables: { FILE: '/src/Input.ts', EXTRA: 'typescript' },
                    options: { priority: 1 },
                },
            ]));
        });

        it('should merge contextMatchFn matches that share a contextName into one context', async () => {
            const inputCodeBasePaths = [
                { isDir: false, path: '/src/Button.ts' },
                { isDir: false, path: '/src/Input.ts' },
            ];
            const contextMatchFn: ContextMatchFn = ({ codeBasePath }) => {
                if (!codeBasePath.path.endsWith('.ts')) return null;
                return {
                    contextName: 'components',
                    filePathVariableName: codeBasePath.path.includes('Button') ? 'BUTTON' : 'INPUT',
                };
            };
            const data = assertSuccess(await resolveJsConf({
                getContextListFn: undefined,
                contextMatchFn,
            }));
            const contexts = await data.getContextListFn({
                codeBasePaths: inputCodeBasePaths,
                lumpVariables: {},
            });
            expect(contexts).toHaveLength(1);
            expect(contexts[0]).toEqual({
                name: 'components',
                variables: {
                    BUTTON: '/src/Button.ts',
                    INPUT: '/src/Input.ts',
                },
            });
        });
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
            expect(item.commandFn.commandName).toBe('test-agent');
            expect(await item.commandFn(commandFnCallArgs)).toEqual({ executable: 'local-agent', args: ['--local'] });
        });

        it('should fall back to the global command when local is missing', async () => {
            const data = assertSuccess(await resolveJsConf(
                { command: 'test-agent', prompt: 'Do something' },
                { localConfigFolderPath: path.join(FIXTURES_DIR, 'nonexistent-local'), globalConfigFolderPath: GLOBAL_CONFIG_PATH },
            ));
            expect(await (data.steps[0] as Step).commandFn(commandFnCallArgs)).toEqual({ executable: 'global-agent', args: ['--global'] });
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
            expect(item0.commandFn.commandName).toBe('test-agent');
            expect(item1.commandFn.commandName).toBe('second-agent');
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
    });

    describe('passthrough fields', () => {
        it('should pass through optional RunLumpInput fields', async () => {
            const data = assertSuccess(await resolveJsConf({ numberOfContextsPerBranch: 3, verbose: true, lumpVariables: { framework: 'vue' } }));
            expect(data.numberOfContextsPerBranch).toBe(3);
            expect(data.lumpVariables).toEqual({ framework: 'vue' });
            expect('verbose' in data).toBe(false);
        });
    });

    describe('project root resolution', () => {
        it('should derive projectRoot from localConfigFolderPath', async () => {
            const data = assertSuccess(
                await resolveJsConf({}, { localConfigFolderPath: '/home/user/project/.lumpcode' }),
            );
            expect(data.projectRoot).toBe('/home/user/project');
        });
    });

    describe('recursive steps', () => {
        it('should preserve function items as wrappers that resolve sub-items', async () => {
            const recursiveFn = vi.fn(async () => ['Sub-step 1 for {FILE}', 'Sub-step 2 for {FILE}']);
            const data = assertSuccess(await resolveJsConf({
                command: stubCommandFn,
                prompt: undefined,
                steps: ['Top-level step', recursiveFn],
            }));
            expect(data.steps).toHaveLength(2);
            expect(typeof data.steps[0]).toBe('object');
            expect(typeof data.steps[1]).toBe('function');

            const subItems = await (data.steps[1] as Function)({
                context: { name: 'ctx', variables: { FILE: 'app.ts' } },
                stepIndex: [1],
                contextRunState: {},
                lumpVariables: {},
            }) as Step[];
            expect(subItems).toHaveLength(2);
            expect(await subItems[0].promptFn?.(promptFnInput({ FILE: 'app.ts' }))).toBe('Sub-step 1 for app.ts');
            expect(await subItems[1].promptFn?.(promptFnInput({ FILE: 'app.ts' }))).toBe('Sub-step 2 for app.ts');
            expect(subItems[0].commandFn).toBe(stubCommandFn);
            expect(subItems[1].commandFn).toBe(stubCommandFn);
            expect(recursiveFn).toHaveBeenCalledOnce();
        });

        it('should require registerCommands for string commands inside recursive items', async () => {
            const recursiveFn = async () => [{ promptTemplate: 'Do work', command: 'test-agent' } as LumpJsConfigStep];
            const data = assertSuccess(await resolveWithFixtures({
                command: stubCommandFn,
                prompt: undefined,
                steps: [recursiveFn],
            }));
            const wrapper = data.steps[0] as Function;
            await expect(wrapper(promptFnInput())).rejects.toThrow('Command test-agent not registered in recursive call');
        });

        it('should allow pre-registered commands in recursive items via registerCommands', async () => {
            const recursiveFn = async () => [{ promptTemplate: 'Do work', command: 'test-agent' } as LumpJsConfigStep];
            const data = assertSuccess(await resolveWithFixtures({
                command: stubCommandFn,
                registerCommands: ['test-agent'],
                prompt: undefined,
                steps: [recursiveFn],
            }));
            const subItems = await (data.steps[0] as Function)(promptFnInput()) as Step[];
            expect(subItems).toHaveLength(1);
            expect(subItems[0].commandFn.commandName).toBe('test-agent');
        });

        it('should execute all prompts including recursive ones through runLump', async () => {
            const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-test-'));
            try {
                initTestGitRepo(tmpDir);
                await fs.mkdir(path.join(tmpDir, '.lumpcode'), { recursive: true });
                const log: string[] = [];
                const cmd: CommandFn = ({ prompt }) => { log.push(prompt); return { executable: 'echo', args: ['done'] }; };

                const globalDir = path.join(tmpDir, 'global-cli');
                await fs.mkdir(globalDir, { recursive: true });

                const resolved = assertSuccess(await jsConfigToRunLumpInput({
                    config: makeConfig({
                        command: cmd,
                        getContextListFn: () => [{ name: 'component', variables: { FILE: 'Button.tsx' } }],
                        prompt: undefined,
                        steps: ['Top-level step for {FILE}', async () => ['Sub-step 1 for {FILE}', 'Sub-step 2 for {FILE}']],
                    }),
                    lumpName: 'test-recursive',
                    localConfigFolderPath: path.join(tmpDir, '.lumpcode'),
                    globalConfigFolderPath: globalDir,
                    projectBaseBranch: 'main',
                    executionWorkspacePath: tmpDir,
                    workspaceStrategy: 'checkout',
                }));

                const runResult = await runLump({
                    ...resolved,
                    setupWorkspaceFn: async () => ({ command: '', workspacePath: tmpDir }),
                    teardownWorkspaceFn: async () => '',
                    gitAddCommandFn: () => 'echo git-add',
                    gitCommitCommandFn: () => 'echo git-commit',
                    gitCommitMessageFn: () => 'test commit',
                    gitPushCommandFn: () => 'echo git-push',
                });
                expect(runResult.success).toBe(true);
                expect(log).toEqual(['Top-level step for Button.tsx', 'Sub-step 1 for Button.tsx', 'Sub-step 2 for Button.tsx']);
            } finally {
                await fs.rm(tmpDir, { recursive: true, force: true });
            }
        });

        it('completes e2e-style recursive loop with prompt-less command-only steps', async () => {
            const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-loop-test-'));
            const SUCCESS_ATTEMPT = 4;
            const echoOk = () => ({ executable: 'echo', args: ['ok'] });

            function getRecursiveSteps(): LumpJsConfigSteps {
                return [
                    {
                        commandFn({ context }) {
                            writeFileSync(path.join(tmpDir, `loop-${context.variables.NAME}.txt`), 'wrong content');
                            return echoOk();
                        },
                    } as LumpJsConfigStep,
                    {
                        commandFn({ stepIndex }) {
                            const depth = Array.isArray(stepIndex) ? stepIndex.length : 1;
                            if (depth > SUCCESS_ATTEMPT) {
                                return { executable: 'echo', args: ['Loop limit reached'] };
                            }
                            return echoOk();
                        },
                        postCommandExecFn({ contextRunState }) {
                            const attempt = (Number(contextRunState.loopAttempts) ?? 0) + 1;
                            contextRunState.loopAttempts = attempt;
                            contextRunState.loopIsValid = attempt >= SUCCESS_ATTEMPT;
                        },
                    } as LumpJsConfigStep,
                    (({ contextRunState, stepIndex }) => {
                        const depth = Array.isArray(stepIndex) ? stepIndex.length : 1;
                        if (depth > SUCCESS_ATTEMPT) {
                            return [];
                        }
                        if (!contextRunState.loopIsValid) {
                            return getRecursiveSteps();
                        }
                        return [];
                    }) as LumpJsConfigSteps[number],
                ];
            }

            try {
                initTestGitRepo(tmpDir);
                await fs.mkdir(path.join(tmpDir, '.lumpcode'), { recursive: true });
                const globalDir = path.join(tmpDir, 'global-cli');
                await fs.mkdir(globalDir, { recursive: true });

                const resolved = assertSuccess(await jsConfigToRunLumpInput({
                    config: {
                        getContextListFn: () => [{ name: 'loopCtx', variables: { NAME: 'loopCtx' } }],
                        steps: getRecursiveSteps(),
                        numberOfContextsPerBranch: 1,
                    } as LumpJsConfig,
                    lumpName: 'loop-lump',
                    localConfigFolderPath: path.join(tmpDir, '.lumpcode'),
                    globalConfigFolderPath: globalDir,
                    projectBaseBranch: 'main',
                    executionWorkspacePath: tmpDir,
                    workspaceStrategy: 'checkout',
                }));

                const runResult = await runLump({
                    ...resolved,
                    setupWorkspaceFn: async () => ({ command: '', workspacePath: tmpDir }),
                    teardownWorkspaceFn: async () => '',
                    gitAddCommandFn: () => 'echo git-add',
                    gitCommitCommandFn: () => 'echo git-commit',
                    gitCommitMessageFn: () => 'test commit',
                    gitPushCommandFn: () => 'echo git-push',
                });
                expect(runResult.success).toBe(true);
            } finally {
                await fs.rm(tmpDir, { recursive: true, force: true });
            }
        });

        it('writes prompt history when keepHistory is true', async () => {
            const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lump-history-test-'));
            const lumpName = 'history-lump';
            try {
                initTestGitRepo(tmpDir);
                await fs.mkdir(path.join(tmpDir, '.lumpcode'), { recursive: true });
                const cmd: CommandFn = () => ({ executable: 'echo', args: ['agent-output'] });
                const globalDir = path.join(tmpDir, 'global-cli');
                await fs.mkdir(globalDir, { recursive: true });

                const resolved = assertSuccess(await jsConfigToRunLumpInput({
                    config: makeConfig({
                        keepHistory: true,
                        command: cmd,
                        getContextListFn: () => [{ name: 'component', variables: { FILE: 'Button.tsx' } }],
                        prompt: undefined,
                        steps: ['Step one for {FILE}', 'Step two for {FILE}'],
                    }),
                    lumpName,
                    localConfigFolderPath: path.join(tmpDir, '.lumpcode'),
                    globalConfigFolderPath: globalDir,
                    projectBaseBranch: 'main',
                    executionWorkspacePath: tmpDir,
                }));

                const runResult = await runLump({
                    ...resolved,
                    setupWorkspaceFn: async () => ({ command: '', workspacePath: tmpDir }),
                    teardownWorkspaceFn: async () => '',
                    gitAddCommandFn: () => 'echo git-add',
                    gitCommitCommandFn: () => 'echo git-commit',
                    gitCommitMessageFn: () => 'test commit',
                    gitPushCommandFn: () => 'echo git-push',
                });
                expect(runResult.success).toBe(true);

                const historyPath = path.join(
                    tmpDir,
                    '.lumpcode',
                    'lumps',
                    lumpName,
                    'history',
                    'component.json',
                );
                const historyRaw = await fs.readFile(historyPath, 'utf-8');
                const history = JSON.parse(historyRaw) as Array<{
                    commandResult: string;
                    context: { name: string };
                    prompt: string;
                    stepIndex: number;
                    projectRoot: string;
                }>;
                expect(history).toHaveLength(2);
                expect(history[0].context.name).toBe('component');
                expect(history[0].prompt).toBe('Step one for Button.tsx');
                expect(history[0].stepIndex).toBe(0);
                expect(history[0].projectRoot).toBe(tmpDir);
                expect(history[0].commandResult).toContain('agent-output');
                expect(history[1].prompt).toBe('Step two for Button.tsx');
                expect(history[1].stepIndex).toBe(1);
            } finally {
                await fs.rm(tmpDir, { recursive: true, force: true });
            }
        });
    });
});
