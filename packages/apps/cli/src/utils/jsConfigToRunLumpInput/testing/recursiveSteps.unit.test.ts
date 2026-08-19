import { writeFileSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { load as loadYaml } from 'js-yaml';

import type { CommandFn, Step } from '@lumpcode/core';
import { runLump, success } from '@lumpcode/core';

import type { LumpJsConfig, LumpJsConfigStep, LumpJsConfigSteps } from '../../../types';
import { jsConfigToRunLumpInput } from '../main';
import {
    assertSuccess,
    initTestGitRepo,
    makeConfig,
    promptFnInput,
    resolveJsConf,
    resolveWithFixtures,
    stubCommandFn,
} from './testHelpers';

describe('jsConfigToRunLumpInput recursive steps', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

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
        expect(subItems[0].commandFn?.commandName).toBe('test-agent');
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
                gitAddCommitFn: () => success('echo git-add-commit'),
                gitCommitMessageFn: () => 'test commit',
                gitPushFn: () => success('echo git-push'),
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
                gitAddCommitFn: () => success('echo git-add-commit'),
                gitCommitMessageFn: () => 'test commit',
                gitPushFn: () => success('echo git-push'),
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
                gitAddCommitFn: () => success('echo git-add-commit'),
                gitCommitMessageFn: () => 'test commit',
                gitPushFn: () => success('echo git-push'),
            });
            expect(runResult.success).toBe(true);

            const historyPath = path.join(
                tmpDir,
                '.lumpcode',
                'lumps',
                lumpName,
                'history',
                'component.yaml',
            );
            const historyRaw = await fs.readFile(historyPath, 'utf-8');
            const history = loadYaml(historyRaw) as Array<{
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
