import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Agent, Context, Shell, ShellResult, WorkflowInput } from '@lumpcode/core';

import { abstractionBacklog } from './workflowRecipe';

// Skipped until the impl stage fills in the workflow recipe. Unskip; do not rewrite.
describe('abstractionBacklog workflow', () => {
    let projectRoot: string;
    let configPath: string;
    const lumpRelativePath = '.lumpcode/lumps/abstractionImplementer';

    afterEach(async () => {
        if (projectRoot) {
            await rm(projectRoot, { recursive: true, force: true });
        }
    });

    it('returns a workflow config and no steps', async () => {
        await scaffold();
        const config = abstractionBacklog({ configUrl: pathToFileURL(configPath) });

        expect(config.steps).toBeUndefined();
        expect(config.workflow).toEqual(expect.any(Function));
    });

    it('ignores items without requirements and emits implementation contexts for ready items', async () => {
        await scaffold();
        await writeItem('ready');
        await writeItem('waiting');
        await writeFile(
            path.join(projectRoot, lumpRelativePath, 'backlogItems', 'todo', 'ready', 'requirements.md'),
            '# Requirements\n',
        );
        const config = abstractionBacklog({ configUrl: pathToFileURL(configPath) });

        const contexts = await list(config);

        expect(contexts).toHaveLength(1);
        expect(contexts[0]).toMatchObject({
            name: 'ready',
            variables: {
                TASK_NAME: 'ready',
                BACKLOG_STAGE: 'implementation',
                REQ_FILE: `${lumpRelativePath}/backlogItems/todo/ready/requirements.md`,
            },
        });
    });

    it('prompts, then checks, and reports a red result', async () => {
        await scaffold();
        const reqFile = `${lumpRelativePath}/backlogItems/todo/ready/requirements.md`;
        const reds = [0, 1, 2, 3].map(() => shellResult(false));
        const { input, prompts, shellCalls } = fakeRuntime({
            name: 'ready',
            variables: {
                TASK_NAME: 'ready',
                TASK: 'Ready task',
                BACKLOG_STAGE: 'implementation',
                REQ_FILE: reqFile,
                BACKLOG_ITEMS_DIR: `${lumpRelativePath}/backlogItems`,
                BACKLOG_ITEM_DIR: `${lumpRelativePath}/backlogItems/todo/ready`,
            },
        }, reds);
        const config = abstractionBacklog({
            configUrl: pathToFileURL(configPath),
            implValidateCommand: 'npm test',
        });

        const result = await run(config, input);

        expect(result).toEqual({
            succeeded: false,
            message: 'Tests still red after 3 attempts.',
        });
        expect(prompts[0]).toContain(`Implement the abstraction described in @${reqFile}.`);
        expect(shellCalls).toHaveLength(4);
    });

    it('only prompts when implValidateCommand is unset', async () => {
        await scaffold();
        const { input, prompts, shellCalls } = fakeRuntime({
            name: 'ready',
            variables: {
                TASK_NAME: 'ready',
                TASK: 'Ready task',
                BACKLOG_STAGE: 'implementation',
                REQ_FILE: 'items/todo/ready/requirements.md',
                BACKLOG_ITEMS_DIR: 'items',
                BACKLOG_ITEM_DIR: 'items/todo/ready',
            },
        }, []);
        const config = abstractionBacklog({ configUrl: pathToFileURL(configPath) });

        const result = await run(config, input);

        expect(result).toEqual({ succeeded: true, message: 'Checks passed.' });
        expect(prompts).toHaveLength(1);
        expect(shellCalls).toEqual([]);
    });

    it('uses the caller workflow instead of the default prompt', async () => {
        await scaffold();
        const custom = vi.fn(async () => ({ succeeded: true, message: 'custom' }));
        const { input, prompts } = fakeRuntime({
            name: 'ready',
            variables: { TASK_NAME: 'ready', BACKLOG_STAGE: 'implementation' },
        }, []);
        const config = abstractionBacklog({
            configUrl: pathToFileURL(configPath),
            workflow: custom,
        });

        const result = await run(config, input);

        expect(result).toEqual({ succeeded: true, message: 'custom' });
        expect(custom).toHaveBeenCalledTimes(1);
        expect(prompts).toEqual([]);
    });

    async function scaffold() {
        projectRoot = await mkdtemp(path.join(tmpdir(), 'abstraction-backlog-workflow-'));
        const lumpPath = path.join(projectRoot, lumpRelativePath);
        await mkdir(lumpPath, { recursive: true });
        configPath = path.join(lumpPath, 'config.ts');
        await writeFile(configPath, 'export default {};\n');
    }

    async function writeItem(name: string) {
        const dir = path.join(projectRoot, lumpRelativePath, 'backlogItems', 'todo', name);
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, 'desc.yml'), `name: ${name}\ntask: ${name} task\npriority: 1\n`);
    }
});

function list(config: { getContextListFn?: unknown }) {
    if (typeof config.getContextListFn !== 'function') {
        throw new Error('Expected getContextListFn');
    }
    return config.getContextListFn({
        codeBasePaths: [],
        lumpVariables: {},
        discoveryBranch: 'dev',
    }) as Promise<{ name: string; variables: Record<string, string> }[]>;
}

function shellResult(succeeded: boolean): ShellResult {
    return { output: succeeded ? 'ok' : 'red', succeeded, exitCode: succeeded ? 0 : 1, timedOut: false };
}

function fakeRuntime(context: Context, shellResults: ShellResult[]) {
    const prompts: string[] = [];
    const shellCalls: string[] = [];
    let shellIndex = 0;
    const agent: Agent = {
        async session() {
            return {
                command: 'cursor',
                sessionId: 's1',
                async prompt(text: string) {
                    prompts.push(text);
                    return { output: 'ok', succeeded: true, exitCode: 0, timedOut: false };
                },
            };
        },
        async prompt() {
            throw new Error('workflow should open a session');
        },
    };
    const shell: Shell = async (command) => {
        shellCalls.push(typeof command === 'string' ? command : command.executable);
        const result = shellResults[shellIndex];
        shellIndex += 1;
        if (!result) {
            throw new Error(`unexpected shell call ${shellIndex}`);
        }
        return result;
    };
    const input: WorkflowInput = {
        context,
        lumpVariables: {},
        contextRunState: {},
        projectRoot: '',
        workspacePath: '',
        signal: new AbortController().signal,
        agent,
        shell,
        log: () => undefined,
    };
    return { input, prompts, shellCalls };
}

async function run(config: { workflow?: unknown }, input: WorkflowInput) {
    if (typeof config.workflow !== 'function') {
        throw new Error('expected a workflow function');
    }
    return config.workflow(input);
}
