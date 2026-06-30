import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, access, writeFile, mkdir } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { load as loadYaml } from 'js-yaml';

import type { BranchFn, CommandFn, Context, SetupFn, Steps } from '../../types';
import { executeStepsForContextList } from './main';

const stubBranchFn: BranchFn = async () => 'lump/test/ctx';
const stubGitAdd = () => 'echo git-add';
const stubGitCommit = () => 'echo git-commit';
const stubGitPush = () => 'echo git-push';
const stubGitCommitMessage = () => 'LUMP:ctx';
const echoCommandFn: CommandFn = () => ({ executable: 'echo', args: ['ok'] });

function initTestGitRepo(projectRoot: string) {
    execSync(
        'git init && git config user.email "test@test.com" && git config user.name "Test" && git commit --allow-empty -m "init"',
        { cwd: projectRoot, stdio: 'pipe' },
    );
}

function makeSteps(prompts: string[]): Steps {
    return prompts.map((promptTemplate) => ({
        promptFn: () => promptTemplate,
        commandFn: echoCommandFn,
    }));
}

async function runWithHistory({
    projectRoot,
    getKeepHistoryFilePathFn,
    steps,
    lumpVariables = {},
    contextList = [{ name: 'ctx', variables: {} }],
    setupFn = async () => ({ contextRunState: {} }),
}: {
    projectRoot: string;
    getKeepHistoryFilePathFn: (context: Context) => string | undefined;
    steps: Steps;
    lumpVariables?: Record<string, string>;
    contextList?: Context[];
    setupFn?: SetupFn;
}) {
    return executeStepsForContextList({
        baseBranch: 'main',
        branchFn: stubBranchFn,
        lumpVariables,
        contextList,
        gitAddCommandFn: stubGitAdd,
        gitCommitCommandFn: stubGitCommit,
        gitPushCommandFn: stubGitPush,
        gitCommitMessageFn: stubGitCommitMessage,
        projectRoot,
        steps,
        setupFn,
        teardownFn: async () => undefined,
        setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
        teardownWorkspaceFn: async () => '',
        getKeepHistoryFilePathFn,
    });
}

async function loadHistoryEntries(historyPath: string) {
    return loadYaml(await readFile(historyPath, 'utf-8')) as Array<Record<string, unknown>>;
}

describe('executeStepsForContextList keepHistory', () => {
    let projectRoot: string;

    beforeEach(async () => {
        projectRoot = await mkdtemp(join(tmpdir(), 'history-test-'));
        initTestGitRepo(projectRoot);
    });

    afterEach(async () => {
        await rm(projectRoot, { recursive: true, force: true });
    });

    it('creates nested parent directories and appends history entries', async () => {
        const historyPath = join(projectRoot, '.lumpcode', 'lumps', 'myLump', 'history', 'nested', 'ctx.yaml');
        const result = await runWithHistory({
            projectRoot,
            getKeepHistoryFilePathFn: () => historyPath,
            steps: makeSteps(['first prompt']),
        });
        expect(result.success).toBe(true);

        const history = await loadHistoryEntries(historyPath) as Array<{ commandResult: string; commandSucceeded: boolean; prompt: string }>;
        expect(history).toHaveLength(1);
        expect(history[0].prompt).toBe('first prompt');
        expect(history[0].commandResult).toContain('ok');
        expect(history[0].commandSucceeded).toBe(true);
    });

    it('appends a second entry for a second step', async () => {
        const historyPath = join(projectRoot, 'history', 'ctx.yaml');
        const result = await runWithHistory({
            projectRoot,
            getKeepHistoryFilePathFn: () => historyPath,
            steps: makeSteps(['step one', 'step two']),
        });
        expect(result.success).toBe(true);

        const history = await loadHistoryEntries(historyPath) as Array<{ prompt: string; stepIndex: number }>;
        expect(history).toHaveLength(2);
        expect(history[0].prompt).toBe('step one');
        expect(history[0].stepIndex).toBe(0);
        expect(history[1].prompt).toBe('step two');
        expect(history[1].stepIndex).toBe(1);
    });

    it('does not create a history file when getKeepHistoryFilePathFn returns undefined', async () => {
        const historyPath = join(projectRoot, 'history', 'ctx.yaml');
        const result = await runWithHistory({
            projectRoot,
            getKeepHistoryFilePathFn: () => undefined,
            steps: makeSteps(['only step']),
        });
        expect(result.success).toBe(true);

        await expect(access(historyPath)).rejects.toThrow();
    });

    it('does not append keepHistory when commandFn returns null', async () => {
        const historyPath = join(projectRoot, 'history', 'ctx.yaml');
        const result = await runWithHistory({
            projectRoot,
            getKeepHistoryFilePathFn: () => historyPath,
            steps: [{
                commandFn: () => null,
            }],
        });
        expect(result.success).toBe(true);
        await expect(access(historyPath)).rejects.toThrow();
    });

    it('persists the full PostCommandExecFn input shape on each history entry', async () => {
        const historyPath = join(projectRoot, 'history', 'ctx.yaml');
        const lumpVariables = { LUMP: 'v' };
        const contextList = [{ name: 'ctx', variables: { FILE: 'x.ts' }, options: { priority: 1 } }];
        const result = await runWithHistory({
            projectRoot,
            getKeepHistoryFilePathFn: () => historyPath,
            lumpVariables,
            contextList,
            setupFn: async () => ({ contextRunState: { copilotSetup: { setupChatId: 'test-id' } } }),
            steps: [{
                stepVariables: { S: 'step' },
                promptFn: () => 'single',
                commandFn: () => ({ executable: 'echo', args: ['ok'] }),
            }],
        });
        expect(result.success).toBe(true);

        const history = await loadHistoryEntries(historyPath);
        expect(history).toHaveLength(1);
        const entry = history[0] as Record<string, unknown>;
        expect(entry.commandSucceeded).toBe(true);
        expect(entry.prompt).toBe('single');
        expect(entry.commandResult).toContain('ok');
        expect(entry.context).toEqual({ name: 'ctx', variables: { FILE: 'x.ts' }, options: { priority: 1 } });
        expect(entry.stepIndex).toBe(0);
        expect(entry.contextRunState).toEqual({ copilotSetup: { setupChatId: 'test-id' } });
        expect(entry.lumpVariables).toEqual({ LUMP: 'v' });
        expect(entry.stepVariables).toEqual({ S: 'step' });
        expect(entry.projectRoot).toBe(projectRoot);
        expect(Object.keys(entry).sort()).toEqual([
            'commandResult',
            'commandSucceeded',
            'context',
            'contextRunState',
            'lumpVariables',
            'projectRoot',
            'prompt',
            'stepIndex',
            'stepVariables',
        ].sort());
    });

    it('stores multiline prompt and commandResult as YAML block scalars', async () => {
        const historyPath = join(projectRoot, 'history', 'ctx.yaml');
        const multilinePrompt = 'Refactor src/Button.tsx…\nFocus on keyboard navigation.';
        const multilineOutput = 'Updated Button.tsx\nAdded tabIndex.';
        const result = await runWithHistory({
            projectRoot,
            getKeepHistoryFilePathFn: () => historyPath,
            steps: [{
                promptFn: () => multilinePrompt,
                commandFn: () => ({
                    executable: 'node',
                    args: ['-e', `console.log(${JSON.stringify(multilineOutput)})`],
                }),
            }],
        });
        expect(result.success).toBe(true);

        const history = await loadHistoryEntries(historyPath) as Array<{ prompt: string; commandResult: string }>;
        expect(history).toHaveLength(1);
        expect(history[0].prompt).toBe(multilinePrompt);
        expect(history[0].commandResult.trim()).toBe(multilineOutput);

        const raw = await readFile(historyPath, 'utf-8');
        expect(raw).toMatch(/prompt: \|/);
        expect(raw).toMatch(/commandResult: \|/);
        expect(raw).not.toMatch(/Focus on keyboard navigation\\n/);
    });

    it('writes history before postCommandExecFn runs', async () => {
        const historyPath = join(projectRoot, 'history', 'ctx.yaml');
        const result = await runWithHistory({
            projectRoot,
            getKeepHistoryFilePathFn: () => historyPath,
            setupFn: async () => ({ contextRunState: { beforeHook: true } }),
            steps: [{
                promptFn: () => 'single',
                commandFn: echoCommandFn,
                postCommandExecFn: ({ contextRunState }) => {
                    contextRunState.afterHook = true;
                },
            }],
        });
        expect(result.success).toBe(true);

        const history = await loadHistoryEntries(historyPath) as Array<{ contextRunState: Record<string, unknown> }>;
        expect(history).toHaveLength(1);
        expect(history[0].contextRunState).toEqual({ beforeHook: true });
        expect(history[0].contextRunState.afterHook).toBeUndefined();
    });

    it('records commandSucceeded false when continueOnError allows the walk to continue', async () => {
        const historyPath = join(projectRoot, 'history', 'ctx.yaml');
        const result = await runWithHistory({
            projectRoot,
            getKeepHistoryFilePathFn: () => historyPath,
            steps: [{
                continueOnError: true,
                commandFn: () => ({
                    executable: 'sh',
                    args: ['-c', 'echo verification failed; exit 1'],
                }),
            }, {
                promptFn: () => 'second step',
                commandFn: echoCommandFn,
            }],
        });
        expect(result.success).toBe(true);

        const history = await loadHistoryEntries(historyPath) as Array<{
            commandSucceeded: boolean;
            commandResult: string;
            prompt: string;
        }>;
        expect(history).toHaveLength(2);
        expect(history[0].commandSucceeded).toBe(false);
        expect(history[0].commandResult).toContain('verification failed');
        expect(history[1].prompt).toBe('second step');
    });

    it('records nested stepIndex arrays for recursive dynamic steps', async () => {
        const historyPath = join(projectRoot, 'history', 'ctx.yaml');
        const result = await runWithHistory({
            projectRoot,
            getKeepHistoryFilePathFn: () => historyPath,
            steps: [
                {
                    promptFn: () => 'root step',
                    commandFn: echoCommandFn,
                },
                async () => [{
                    promptFn: () => 'nested step',
                    commandFn: echoCommandFn,
                }],
            ],
        });
        expect(result.success).toBe(true);

        const history = await loadHistoryEntries(historyPath) as Array<{ stepIndex: number | number[]; prompt: string }>;
        expect(history).toHaveLength(2);
        expect(history[0].stepIndex).toBe(0);
        expect(history[1].stepIndex).toEqual([1, 0]);
        expect(history[1].prompt).toBe('nested step');
    });

    it('fails the step walk when appending to invalid YAML', async () => {
        const historyPath = join(projectRoot, 'history', 'ctx.yaml');
        await mkdir(dirname(historyPath), { recursive: true });
        await writeFile(historyPath, '{{invalid', 'utf-8');

        const result = await runWithHistory({
            projectRoot,
            getKeepHistoryFilePathFn: () => historyPath,
            steps: makeSteps(['only step']),
        });

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable');
        expect(result.data.message).toContain(historyPath);
    });
});

describe('executeStepsForContextList dynamic steps', () => {
    let projectRoot: string;

    beforeEach(async () => {
        projectRoot = await mkdtemp(join(tmpdir(), 'dynamic-step-test-'));
        initTestGitRepo(projectRoot);
    });

    afterEach(async () => {
        await rm(projectRoot, { recursive: true, force: true });
    });

    it('resolves recursive steps after prior step command results update contextRunState', async () => {
        const executionOrder: string[] = [];

        const stepsInput: Steps = [
            {
                promptFn: () => 'validate',
                commandFn: () => ({ executable: 'echo', args: ['bad'] }),
                postCommandExecFn: ({ commandResult, contextRunState }) => {
                    executionOrder.push('post-validate');
                    contextRunState.valid = commandResult.includes('good');
                },
            },
            async ({ contextRunState }) => {
                executionOrder.push(`branch:${contextRunState.valid}`);
                if (!contextRunState.valid) {
                    return [
                        {
                            promptFn: () => 'retry',
                            commandFn: () => ({ executable: 'echo', args: ['good'] }),
                            postCommandExecFn: ({ commandResult, contextRunState }) => {
                                executionOrder.push('post-retry');
                                contextRunState.valid = commandResult.includes('good');
                            },
                        },
                    ];
                }
                return [
                    {
                        promptFn: () => 'done',
                        commandFn: () => ({ executable: 'echo', args: ['done'] }),
                    },
                ];
            },
            async ({ contextRunState }) => {
                executionOrder.push(`final:${contextRunState.valid}`);
                return [
                    {
                        promptFn: () => 'final',
                        commandFn: () => ({ executable: 'echo', args: ['final'] }),
                    },
                ];
            },
        ];

        const result = await executeStepsForContextList({
            baseBranch: 'main',
            branchFn: stubBranchFn,
            lumpVariables: {},
            contextList: [{ name: 'ctx', variables: {} }],
            gitAddCommandFn: stubGitAdd,
            gitCommitCommandFn: stubGitCommit,
            gitPushCommandFn: stubGitPush,
            gitCommitMessageFn: stubGitCommitMessage,
            projectRoot,
            steps: stepsInput,
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async () => undefined,
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            teardownWorkspaceFn: async () => '',
            getKeepHistoryFilePathFn: () => undefined,
        });

        expect(result.success).toBe(true);
        expect(executionOrder).toEqual([
            'post-validate',
            'branch:false',
            'post-retry',
            'final:true',
        ]);
    });

    it('passes command env overrides to the spawned process', async () => {
        let commandResult = '';

        const result = await executeStepsForContextList({
            baseBranch: 'main',
            branchFn: stubBranchFn,
            lumpVariables: {},
            contextList: [{ name: 'ctx', variables: {} }],
            gitAddCommandFn: stubGitAdd,
            gitCommitCommandFn: stubGitCommit,
            gitPushCommandFn: stubGitPush,
            gitCommitMessageFn: stubGitCommitMessage,
            projectRoot,
            steps: [{
                commandFn: () => ({
                    executable: 'node',
                    args: ['-e', 'process.stdout.write(process.env.LUMPCODE_TEST_ENV ?? "")'],
                    env: { LUMPCODE_TEST_ENV: 'from-command' },
                }),
                postCommandExecFn: ({ commandResult: result }) => {
                    commandResult = result;
                },
            }],
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async () => undefined,
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            teardownWorkspaceFn: async () => '',
            getKeepHistoryFilePathFn: () => undefined,
        });

        expect(result.success).toBe(true);
        expect(commandResult).toBe('from-command');
    });

    it('runs a prompt-less step with commandFn only', async () => {
        const result = await executeStepsForContextList({
            baseBranch: 'main',
            branchFn: stubBranchFn,
            lumpVariables: {},
            contextList: [{ name: 'ctx', variables: {} }],
            gitAddCommandFn: stubGitAdd,
            gitCommitCommandFn: stubGitCommit,
            gitPushCommandFn: stubGitPush,
            gitCommitMessageFn: stubGitCommitMessage,
            projectRoot,
            steps: [{
                commandFn: () => ({ executable: 'echo', args: ['command-only'] }),
            }],
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async () => undefined,
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            teardownWorkspaceFn: async () => '',
            getKeepHistoryFilePathFn: () => undefined,
        });

        expect(result.success).toBe(true);
    });

    it('skips exec when commandFn returns null but still runs postCommandExecFn', async () => {
        const executionOrder: string[] = [];

        const result = await executeStepsForContextList({
            baseBranch: 'main',
            branchFn: stubBranchFn,
            lumpVariables: {},
            contextList: [{ name: 'ctx', variables: {} }],
            gitAddCommandFn: stubGitAdd,
            gitCommitCommandFn: stubGitCommit,
            gitPushCommandFn: stubGitPush,
            gitCommitMessageFn: stubGitCommitMessage,
            projectRoot,
            steps: [{
                commandFn: () => null,
                postCommandExecFn: ({ commandResult, commandSucceeded, contextRunState }) => {
                    executionOrder.push(`post:${commandResult}`);
                    executionOrder.push(`succeeded:${commandSucceeded}`);
                    contextRunState.ran = true;
                },
            }],
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async ({ contextRunState }) => {
                executionOrder.push(`teardown:${contextRunState.ran}`);
            },
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            teardownWorkspaceFn: async () => '',
            getKeepHistoryFilePathFn: () => undefined,
        });

        expect(result.success).toBe(true);
        expect(executionOrder).toEqual(['post:', 'succeeded:true', 'teardown:true']);
    });

    it('continues the step walk when continueOnError is true and the command fails', async () => {
        const executionOrder: string[] = [];

        const result = await executeStepsForContextList({
            baseBranch: 'main',
            branchFn: stubBranchFn,
            lumpVariables: {},
            contextList: [{ name: 'ctx', variables: {} }],
            gitAddCommandFn: stubGitAdd,
            gitCommitCommandFn: stubGitCommit,
            gitPushCommandFn: stubGitPush,
            gitCommitMessageFn: stubGitCommitMessage,
            projectRoot,
            steps: [{
                continueOnError: true,
                commandFn: () => ({
                    executable: 'sh',
                    args: ['-c', 'echo verification failed; exit 1'],
                }),
                postCommandExecFn: ({ commandResult, commandSucceeded, contextRunState }) => {
                    executionOrder.push(`post:${commandResult.includes('verification failed')}`);
                    executionOrder.push(`succeeded:${commandSucceeded}`);
                    contextRunState.valid = false;
                },
            }, ({ contextRunState }) => {
                executionOrder.push(`dynamic:${contextRunState.valid === false}`);
                return [];
            }],
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async () => undefined,
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            teardownWorkspaceFn: async () => '',
            getKeepHistoryFilePathFn: () => undefined,
        });

        expect(result.success).toBe(true);
        expect(executionOrder).toEqual(['post:true', 'succeeded:false', 'dynamic:true']);
    });

    it('stops the step walk when the command fails and continueOnError is not set', async () => {
        const result = await executeStepsForContextList({
            baseBranch: 'main',
            branchFn: stubBranchFn,
            lumpVariables: {},
            contextList: [{ name: 'ctx', variables: {} }],
            gitAddCommandFn: stubGitAdd,
            gitCommitCommandFn: stubGitCommit,
            gitPushCommandFn: stubGitPush,
            gitCommitMessageFn: stubGitCommitMessage,
            projectRoot,
            steps: [{
                commandFn: () => ({
                    executable: 'sh',
                    args: ['-c', 'exit 1'],
                }),
                postCommandExecFn: () => undefined,
            }, {
                commandFn: () => ({ executable: 'echo', args: ['never reached'] }),
            }],
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async () => undefined,
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            teardownWorkspaceFn: async () => '',
            getKeepHistoryFilePathFn: () => undefined,
        });

        expect(result.success).toBe(false);
    });

    it('does nothing when a dynamic steps function returns an empty array', async () => {
        const executionOrder: string[] = [];

        const result = await executeStepsForContextList({
            baseBranch: 'main',
            branchFn: stubBranchFn,
            lumpVariables: {},
            contextList: [{ name: 'ctx', variables: {} }],
            gitAddCommandFn: stubGitAdd,
            gitCommitCommandFn: stubGitCommit,
            gitPushCommandFn: stubGitPush,
            gitCommitMessageFn: stubGitCommitMessage,
            projectRoot,
            steps: [
                {
                    promptFn: () => 'first',
                    commandFn: () => {
                        executionOrder.push('first');
                        return { executable: 'echo', args: ['first'] };
                    },
                },
                async () => {
                    executionOrder.push('dynamic');
                    return [];
                },
                {
                    promptFn: () => 'third',
                    commandFn: () => {
                        executionOrder.push('third');
                        return { executable: 'echo', args: ['third'] };
                    },
                },
            ],
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async () => undefined,
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            teardownWorkspaceFn: async () => '',
            getKeepHistoryFilePathFn: () => undefined,
        });

        expect(result.success).toBe(true);
        expect(executionOrder).toEqual(['first', 'dynamic', 'third']);
    });

    it('completes e2e-style recursive loop without stack overflow', async () => {
        const SUCCESS_ATTEMPT = 4;
        const echoOk = () => ({ executable: 'echo', args: ['ok'] });

        function getRecursiveSteps(): Steps {
            return [
                {
                    commandFn({ context }) {
                        writeFileSync(join(projectRoot, `loop-${context.variables.NAME}.txt`), 'wrong content');
                        return echoOk();
                    },
                },
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
                },
                async ({ contextRunState, stepIndex }) => {
                    const depth = Array.isArray(stepIndex) ? stepIndex.length : 1;
                    if (depth > SUCCESS_ATTEMPT) {
                        return [];
                    }
                    if (!contextRunState.loopIsValid) {
                        return getRecursiveSteps();
                    }
                    return [];
                },
            ];
        }

        const result = await executeStepsForContextList({
            baseBranch: 'main',
            branchFn: stubBranchFn,
            lumpVariables: {},
            contextList: [{ name: 'loopCtx', variables: { NAME: 'loopCtx' } }],
            gitAddCommandFn: stubGitAdd,
            gitCommitCommandFn: stubGitCommit,
            gitPushCommandFn: stubGitPush,
            gitCommitMessageFn: stubGitCommitMessage,
            projectRoot,
            steps: getRecursiveSteps(),
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async () => undefined,
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            teardownWorkspaceFn: async () => '',
            getKeepHistoryFilePathFn: () => undefined,
        });

        expect(result.success).toBe(true);
    });

    it('logs the active context via logger.info even when verbose is false', async () => {
        const infoCalls: string[] = [];
        const logger = {
            error: () => {},
            warn: () => {},
            info: (message: string) => {
                infoCalls.push(message);
            },
            verbose: () => {},
            child: () => logger,
        };

        const result = await executeStepsForContextList({
            baseBranch: 'main',
            branchFn: stubBranchFn,
            lumpVariables: {},
            contextList: [
                { name: 'first', variables: {} },
                { name: 'second', variables: {} },
            ],
            gitAddCommandFn: stubGitAdd,
            gitCommitCommandFn: stubGitCommit,
            gitPushCommandFn: stubGitPush,
            gitCommitMessageFn: stubGitCommitMessage,
            projectRoot,
            steps: makeSteps(['only step']),
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async () => undefined,
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            teardownWorkspaceFn: async () => '',
            getKeepHistoryFilePathFn: () => undefined,
            logger,
        });

        expect(result.success).toBe(true);
        expect(infoCalls).toEqual([
            'Running context "first" (1/2)',
            'Running context "second" (2/2)',
        ]);
    });

    it('logs commit failures via logger.error even when verbose is false', async () => {
        const errorCalls: string[] = [];
        const logger = {
            error: (message: string) => {
                errorCalls.push(message);
            },
            warn: () => {},
            info: () => {},
            verbose: () => {},
            child: () => logger,
        };

        const result = await executeStepsForContextList({
            baseBranch: 'main',
            branchFn: stubBranchFn,
            lumpVariables: {},
            contextList: [{ name: 'ctx', variables: {} }],
            gitAddCommandFn: stubGitAdd,
            gitCommitCommandFn: () => 'git commit --allow-empty -m "fail-test" && exit 1',
            gitPushCommandFn: stubGitPush,
            gitCommitMessageFn: stubGitCommitMessage,
            projectRoot,
            steps: makeSteps(['only step']),
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async () => undefined,
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            teardownWorkspaceFn: async () => '',
            getKeepHistoryFilePathFn: () => undefined,
            logger,
        });

        expect(result.success).toBe(true);
        expect(errorCalls.some((message) => message.includes('git commit for context ctx'))).toBe(true);
    });

    it('logs push failures via logger.error even when verbose is false', async () => {
        const errorCalls: string[] = [];
        const logger = {
            error: (message: string) => {
                errorCalls.push(message);
            },
            warn: () => {},
            info: () => {},
            verbose: () => {},
            child: () => logger,
        };

        const result = await executeStepsForContextList({
            baseBranch: 'main',
            branchFn: stubBranchFn,
            lumpVariables: {},
            contextList: [{ name: 'ctx', variables: {} }],
            gitAddCommandFn: stubGitAdd,
            gitCommitCommandFn: stubGitCommit,
            gitPushCommandFn: () => 'git push && exit 1',
            gitCommitMessageFn: stubGitCommitMessage,
            projectRoot,
            steps: makeSteps(['only step']),
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async () => undefined,
            setupWorkspaceFn: async () => ({ command: '', workspacePath: projectRoot }),
            teardownWorkspaceFn: async () => '',
            getKeepHistoryFilePathFn: () => undefined,
            logger,
        });

        expect(result.success).toBe(true);
        expect(errorCalls.some((message) => message.includes('git push on branch'))).toBe(true);
    });
});

describe('executeStepsForContextList setupWorkspaceFn.afterExec', () => {
    let projectRoot: string;

    beforeEach(async () => {
        projectRoot = await mkdtemp(join(tmpdir(), 'after-setup-hook-'));
        initTestGitRepo(projectRoot);
    });

    afterEach(async () => {
        await rm(projectRoot, { recursive: true, force: true });
    });

    it('invokes afterExec after successful setup exec', async () => {
        const hookCalls: Array<{ workspacePath: string }> = [];
        const branchWorkspacePath = join(projectRoot, 'branch-ws');

        const result = await executeStepsForContextList({
            baseBranch: 'main',
            branchFn: stubBranchFn,
            lumpVariables: {},
            contextList: [{ name: 'ctx', variables: {} }],
            gitAddCommandFn: stubGitAdd,
            gitCommitCommandFn: stubGitCommit,
            gitPushCommandFn: stubGitPush,
            gitCommitMessageFn: stubGitCommitMessage,
            projectRoot,
            steps: makeSteps(['step']),
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async () => undefined,
            setupWorkspaceFn: async () => ({
                command: `mkdir "${branchWorkspacePath}"`,
                workspacePath: branchWorkspacePath,
                afterExec: async (input) => {
                    hookCalls.push(input);
                },
            }),
            teardownWorkspaceFn: async () => '',
            getKeepHistoryFilePathFn: () => undefined,
        });

        expect(result.success).toBe(true);
        expect(hookCalls).toEqual([{ workspacePath: branchWorkspacePath }]);
    });

    it('does not invoke afterExec when setup exec fails', async () => {
        const hookCalls: string[] = [];

        const result = await executeStepsForContextList({
            baseBranch: 'main',
            branchFn: stubBranchFn,
            lumpVariables: {},
            contextList: [{ name: 'ctx', variables: {} }],
            gitAddCommandFn: stubGitAdd,
            gitCommitCommandFn: stubGitCommit,
            gitPushCommandFn: stubGitPush,
            gitCommitMessageFn: stubGitCommitMessage,
            projectRoot,
            steps: makeSteps(['step']),
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async () => undefined,
            setupWorkspaceFn: async () => ({
                command: 'exit 1',
                workspacePath: projectRoot,
                afterExec: async () => {
                    hookCalls.push('called');
                },
            }),
            teardownWorkspaceFn: async () => '',
            getKeepHistoryFilePathFn: () => undefined,
        });

        expect(result.success).toBe(false);
        expect(hookCalls).toEqual([]);
    });

    it('does not invoke afterExec when setup command is empty', async () => {
        const hookCalls: string[] = [];

        const result = await executeStepsForContextList({
            baseBranch: 'main',
            branchFn: stubBranchFn,
            lumpVariables: {},
            contextList: [{ name: 'ctx', variables: {} }],
            gitAddCommandFn: stubGitAdd,
            gitCommitCommandFn: stubGitCommit,
            gitPushCommandFn: stubGitPush,
            gitCommitMessageFn: stubGitCommitMessage,
            projectRoot,
            steps: makeSteps(['step']),
            setupFn: async () => ({ contextRunState: {} }),
            teardownFn: async () => undefined,
            setupWorkspaceFn: async () => ({
                command: '',
                workspacePath: projectRoot,
                afterExec: async () => {
                    hookCalls.push('called');
                },
            }),
            teardownWorkspaceFn: async () => '',
            getKeepHistoryFilePathFn: () => undefined,
        });

        expect(result.success).toBe(true);
        expect(hookCalls).toEqual([]);
    });
});
