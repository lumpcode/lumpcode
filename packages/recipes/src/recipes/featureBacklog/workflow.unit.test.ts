import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

import type {
    Agent,
    AgentSession,
    CommandDescriptor,
    Context,
    LumpVariables,
    PromptOptions,
    Shell,
    ShellOptions,
    ShellResult,
    WorkflowInput,
} from '@lumpcode/core';

import { defaultReqFixPrompt, defaultTestPlanFixPrompt } from './defaultPrompts';
import { featureBacklog } from './workflowRecipe';

// Skipped until the impl stage fills in the workflow recipe. Unskip; do not rewrite.
describe.skip('featureBacklog workflow', () => {
    async function scaffold() {
        projectRoot = await mkdtemp(path.join(tmpdir(), 'feature-backlog-workflow-'));
        workspacePath = projectRoot;
        const lumpPath = path.join(projectRoot, '.lumpcode', 'lumps', 'ship');
        await mkdir(lumpPath, { recursive: true });
        const configPath = path.join(lumpPath, 'config.ts');
        await writeFile(configPath, 'export default {};\n');
        configUrl = pathToFileURL(configPath);
    }

    async function cleanup() {
        await rm(projectRoot, { recursive: true, force: true });
    }

    it('returns a workflow config and no steps', async () => {
        await scaffold();
        const config = featureBacklog({ configUrl });

        expect(config.steps).toBeUndefined();
        expect(config.workflow).toEqual(expect.any(Function));
        expect(config.discoveryBranches).toEqual(['dev', 'feature/*']);
        await cleanup();
    });

    it('req prompts, then requireArtifact, and reports a missing file', async () => {
        await scaffold();
        const context = stageContext('req');
        const { input, prompts, shellCalls, sessionCalls } = fakeRuntime(context);
        const config = featureBacklog({
            configUrl,
            prompts: { req: 'Write the requirements.' },
        });

        const result = await runWorkflow(config, input);
        const fix = await defaultReqFixPrompt()({
            context,
            lumpVariables: {},
            stepIndex: 0,
            contextRunState: {},
        });

        expect(result).toEqual({
            succeeded: false,
            message: `Missing ${context.variables.REQ_FILE}.`,
        });
        expect(sessionCalls).toEqual([[]]);
        expect(prompts.map((prompt) => prompt.text)).toEqual(['Write the requirements.', fix, fix]);
        expect(shellCalls).toEqual([]);
        await cleanup();
    });

    it('req reports success when the artifact exists after the stage prompt', async () => {
        await scaffold();
        const context = stageContext('req');
        const reqPath = path.join(workspacePath, String(context.variables.REQ_FILE));
        const { input, prompts } = fakeRuntime(context, {
            onPrompt: async (text) => {
                if (text === 'Write the requirements.') {
                    await mkdir(path.dirname(reqPath), { recursive: true });
                    await writeFile(reqPath, '# Requirements\n');
                }
            },
        });
        const config = featureBacklog({
            configUrl,
            prompts: { req: 'Write the requirements.' },
        });

        const result = await runWorkflow(config, input);

        expect(result).toEqual({
            succeeded: true,
            message: `Wrote ${context.variables.REQ_FILE}.`,
        });
        expect(prompts.map((prompt) => prompt.text)).toEqual(['Write the requirements.']);
        expect(await readFile(reqPath, 'utf-8')).toContain('Requirements');
        await cleanup();
    });

    it('testPlan uses the test-plan path and today\'s fix prompt', async () => {
        await scaffold();
        const context = stageContext('testPlan');
        const { input, prompts } = fakeRuntime(context);
        const config = featureBacklog({ configUrl });

        const result = await runWorkflow(config, input);
        const fix = await defaultTestPlanFixPrompt()({
            context,
            lumpVariables: {},
            stepIndex: 0,
            contextRunState: {},
        });

        expect(result).toEqual({
            succeeded: false,
            message: `Missing ${context.variables.TEST_PLAN_FILE}.`,
        });
        expect(prompts[0]?.text).toContain('test plan');
        expect(prompts[0]?.text).toContain(String(context.variables.TEST_PLAN_FILE));
        expect(prompts.slice(1).map((prompt) => prompt.text)).toEqual([fix, fix]);
        await cleanup();
    });

    it('uses a prompt string, then a green check', async () => {
        await scaffold();
        const context = stageContext('impl');
        const green = shellResult({ succeeded: true, output: 'ok' });
        const { input, prompts, shellCalls } = fakeRuntime(context, { shellResults: [green] });
        const config = featureBacklog({
            configUrl,
            prompts: { impl: 'Implement the ticket' },
            implValidateCommand: 'npm test',
        });

        const result = await runWorkflow(config, input);

        expect(result).toEqual({ succeeded: true, message: 'Checks passed.' });
        expect(prompts.map((prompt) => prompt.text)).toEqual(['Implement the ticket']);
        expect(shellCalls).toEqual([
            { command: 'npm test', options: { label: 'retry: npm test' } },
        ]);
        await cleanup();
    });

    it('calls a prompt function with the context and lump variables', async () => {
        await scaffold();
        const context = stageContext('impl');
        const seen: { task: string; model: string }[] = [];
        const { input } = fakeRuntime(context, {
            lumpVariables: { model: 'grok' },
            shellResults: [shellResult({ succeeded: true, output: 'ok' })],
        });
        const config = featureBacklog<{ model: string }>({
            configUrl,
            implValidateCommand: 'npm test',
            prompts: {
                impl: ({ context: ctx, lumpVariables }) => {
                    seen.push({
                        task: String(ctx.variables.TASK_NAME),
                        model: lumpVariables.model,
                    });
                    return 'from the function';
                },
            },
        });

        await runWorkflow(config, input);

        expect(seen).toEqual([{ task: 'alpha', model: 'grok' }]);
        await cleanup();
    });

    it.each(['testImpl', 'impl', 'directImpl'] as const)(
        '%s stays red after the default 3 fix attempts and still returns a result',
        async (stage) => {
            await scaffold();
            const context = stageContext(stage);
            const reds = [0, 1, 2, 3].map((index) => shellResult({
                succeeded: false,
                output: `red ${index}`,
            }));
            const { input, prompts, shellCalls } = fakeRuntime(context, { shellResults: reds });
            const config = featureBacklog({
                configUrl,
                prompts: { [stage]: 'Do the work' },
                implValidateCommand: 'npm test',
            });

            const result = await runWorkflow(config, input);

            expect(result).toEqual({
                succeeded: false,
                message: 'Tests still red after 3 attempts.',
            });
            expect(shellCalls).toHaveLength(4);
            expect(prompts.map((prompt) => prompt.options?.label)).toEqual([
                undefined,
                'retry fix 1/3',
                'retry fix 2/3',
                'retry fix 3/3',
            ]);
            await cleanup();
        },
    );

    it('passes maxAttempts to the check loop', async () => {
        await scaffold();
        const context = stageContext('impl');
        const reds = [0, 1].map((index) => shellResult({
            succeeded: false,
            output: `red ${index}`,
        }));
        const { input, prompts, shellCalls } = fakeRuntime(context, { shellResults: reds });
        const config = featureBacklog({
            configUrl,
            maxAttempts: 1,
            prompts: { impl: 'Do the work' },
            implValidateCommand: 'npm test',
        });

        const result = await runWorkflow(config, input);

        expect(result).toEqual({
            succeeded: false,
            message: 'Tests still red after 1 attempts.',
        });
        expect(shellCalls).toHaveLength(2);
        expect(prompts[1]?.options?.label).toBe('retry fix 1/1');
        await cleanup();
    });

    it('runs a command returned by implValidateCommand', async () => {
        await scaffold();
        const context = stageContext('impl');
        const descriptor: CommandDescriptor = { executable: 'npm', args: ['test'] };
        const seen: string[] = [];
        const { input, shellCalls } = fakeRuntime(context, {
            shellResults: [shellResult({ succeeded: true, output: 'ok' })],
        });
        const config = featureBacklog<{ model: string }>({
            configUrl,
            prompts: { impl: 'Do the work' },
            implValidateCommand: ({ context: ctx, lumpVariables }) => {
                seen.push(`${ctx.name}:${lumpVariables.model}`);
                return descriptor;
            },
        });

        await runWorkflow(config, {
            ...input,
            lumpVariables: { model: 'grok' },
        });

        expect(seen).toEqual(['alpha:grok']);
        expect(shellCalls[0]?.command).toEqual(descriptor);
        await cleanup();
    });

    it('only prompts when implValidateCommand is missing or returns null', async () => {
        await scaffold();
        const context = stageContext('testImpl');
        const { input, prompts, shellCalls } = fakeRuntime(context);
        const config = featureBacklog({
            configUrl,
            prompts: { testImpl: 'Write skipped tests' },
            implValidateCommand: () => null,
        });

        const result = await runWorkflow(config, input);

        expect(result).toEqual({ succeeded: true, message: 'Checks passed.' });
        expect(prompts.map((prompt) => prompt.text)).toEqual(['Write skipped tests']);
        expect(shellCalls).toEqual([]);
        await cleanup();
    });

    it('completion moves the item to completed and does not prompt', async () => {
        await scaffold();
        const context = stageContext('completion');
        const itemDir = path.join(workspacePath, String(context.variables.BACKLOG_ITEM_DIR));
        await mkdir(itemDir, { recursive: true });
        await writeFile(
            path.join(itemDir, 'desc.yml'),
            'name: alpha\ntask: Alpha\npriority: 1\n',
        );
        const { input, prompts } = fakeRuntime(context);
        const config = featureBacklog({ configUrl });

        const result = await runWorkflow(config, input);
        const completed = await readFile(
            path.join(
                workspacePath,
                '.lumpcode/lumps/ship/backlogItems/completed/alpha/desc.yml',
            ),
            'utf-8',
        );

        expect(result).toEqual({ succeeded: true, message: 'Moved alpha to completed.' });
        expect(prompts).toEqual([]);
        expect(completed).toContain('completedAt:');
        await expect(readFile(path.join(itemDir, 'desc.yml'), 'utf-8')).rejects.toThrow();
        await cleanup();
    });
});

const ITEM_DIR = '.lumpcode/lumps/ship/backlogItems/todo/alpha';

function stageContext(stage: string): Context {
    const variables: Context['variables'] = {
        TASK_NAME: 'alpha',
        TASK: 'Alpha task',
        BACKLOG_ITEMS_DIR: '.lumpcode/lumps/ship/backlogItems',
        BACKLOG_ITEM_DIR: ITEM_DIR,
        BACKLOG_STAGE: stage,
        STAGES: 'req,testPlan,testImpl,impl',
        WORKFLOW: 'req,testPlan,testImpl,impl',
        REQ_FILE: `${ITEM_DIR}/requirements.md`,
        TEST_PLAN_FILE: `${ITEM_DIR}/testPlan.md`,
    };
    const name = stage === 'impl' || stage === 'directImpl' || stage === 'completion'
        ? 'alpha'
        : `alpha_${stage}`;
    return { name, variables };
}

function shellResult({ succeeded, output }: { succeeded: boolean; output: string }): ShellResult {
    return {
        output,
        succeeded,
        exitCode: succeeded ? 0 : 1,
        timedOut: false,
    };
}

function fakeRuntime(
    context: Context,
    extra: {
        shellResults?: ShellResult[];
        lumpVariables?: LumpVariables;
        onPrompt?: (text: string) => void | Promise<void>;
    } = {},
) {
    const prompts: { text: string; options?: PromptOptions }[] = [];
    const sessionCalls: unknown[][] = [];
    const session: AgentSession = {
        command: 'cursor',
        sessionId: 's1',
        async prompt(text, options) {
            await extra.onPrompt?.(text);
            prompts.push({ text, options });
            return { output: 'ok', succeeded: true, exitCode: 0, timedOut: false };
        },
    };
    const agent: Agent = {
        async session(...args) {
            sessionCalls.push(args);
            return session;
        },
        async prompt() {
            throw new Error('workflow should open a session');
        },
    };
    const shellCalls: { command: string | CommandDescriptor; options?: ShellOptions }[] = [];
    let shellIndex = 0;
    const shell: Shell = async (command, options) => {
        shellCalls.push({ command, options });
        const result = extra.shellResults?.[shellIndex];
        shellIndex += 1;
        if (!result) {
            throw new Error(`unexpected shell call ${shellIndex}`);
        }
        return result;
    };
    const input: WorkflowInput = {
        context,
        lumpVariables: extra.lumpVariables ?? {},
        contextRunState: {},
        projectRoot,
        workspacePath,
        signal: new AbortController().signal,
        agent,
        shell,
        log: () => undefined,
    };
    return { input, prompts, shellCalls, sessionCalls };
}

let projectRoot = '';
let workspacePath = '';
let configUrl: URL;

async function runWorkflow(
    config: { workflow?: unknown },
    input: WorkflowInput,
): Promise<{ succeeded?: boolean; message?: string; push?: boolean }> {
    if (typeof config.workflow !== 'function') {
        throw new Error('expected a workflow function');
    }
    const result = await config.workflow(input);
    return result ?? {};
}
