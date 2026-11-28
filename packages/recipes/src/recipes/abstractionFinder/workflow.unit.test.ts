import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Agent, Context, Shell, WorkflowFn, WorkflowInput } from '@lumpcode/core';

import { abstractionFinder } from './workflowRecipe';

// Skipped until the impl stage fills in the workflow recipe. Unskip; do not rewrite.
describe('abstractionFinder workflow', () => {
    let projectRoot: string;
    let configPath: string;
    const backlogItemsDir = '.lumpcode/lumps/abstractionImplementer/backlogItems';

    afterEach(async () => {
        if (projectRoot) {
            await rm(projectRoot, { recursive: true, force: true });
        }
    });

    it('returns a workflow config and no steps', async () => {
        await scaffold();
        const config = abstractionFinder({
            configUrl: pathToFileURL(configPath),
            backlogItemsDir,
        });

        expect(config.steps).toBeUndefined();
        expect(config.workflow).toEqual(expect.any(Function));
    });

    it('rejects an absolute backlogItemsDir', async () => {
        await scaffold();
        expect(() => abstractionFinder({
            configUrl: pathToFileURL(configPath),
            backlogItemsDir: '/tmp/backlogItems',
        })).toThrow(/project-root-relative/);
    });

    it('emits one context under the cap and none at the cap', async () => {
        await scaffold();
        const itemsDir = path.join(projectRoot, backlogItemsDir);
        await mkdir(path.join(itemsDir, 'todo', 'one'), { recursive: true });
        await mkdir(path.join(itemsDir, 'todo', 'two'), { recursive: true });
        const under = abstractionFinder({
            configUrl: pathToFileURL(configPath),
            backlogItemsDir,
            maxPendingAbstractions: 3,
        });
        const atCap = abstractionFinder({
            configUrl: pathToFileURL(configPath),
            backlogItemsDir,
            maxPendingAbstractions: 2,
        });

        expect(await list(under)).toHaveLength(1);
        expect(await list(atCap)).toEqual([]);
    });

    it('prompts the default scan text', async () => {
        await scaffold();
        const config = abstractionFinder({
            configUrl: pathToFileURL(configPath),
            backlogItemsDir,
            scanDirectories: ['src'],
        });
        const { input, prompts } = fakeRuntime();

        await run(config, input);

        expect(prompts).toHaveLength(1);
        expect(prompts[0]).toContain('Scan @src');
        expect(prompts[0]).not.toContain('packages/apps/cli');
        expect(prompts[0]).toContain('@src/<utilName>/');
    });

    it('runs a string scanCommand, then the prompt', async () => {
        await scaffold();
        const config = abstractionFinder({
            configUrl: pathToFileURL(configPath),
            backlogItemsDir,
            scanDirectories: ['src'],
            scanCommand: 'echo scanned',
        });
        const { input, prompts, shellCalls } = fakeRuntime();

        await run(config, input);

        expect(shellCalls).toEqual(['echo scanned']);
        expect(prompts[0]).toContain('Scan @src');
    });

    it('runs the command a scanCommand function returns', async () => {
        await scaffold();
        const config = abstractionFinder({
            configUrl: pathToFileURL(configPath),
            backlogItemsDir,
            scanCommand: (workflowInput) => `echo ${workflowInput.context.name}`,
        });
        const { input, shellCalls } = fakeRuntime();

        await run(config, input);

        expect(shellCalls[0]).toBe('echo find-one');
    });

    it('runs scanCommand and then the caller workflow', async () => {
        await scaffold();
        const custom = vi.fn(async () => ({ succeeded: true, message: 'custom' }));
        const config = abstractionFinder({
            configUrl: pathToFileURL(configPath),
            backlogItemsDir,
            scanCommand: 'echo scanned',
            workflow: custom,
        });
        const { input, prompts, shellCalls } = fakeRuntime();

        const result = await run(config, input);

        expect(shellCalls).toEqual(['echo scanned']);
        expect(prompts).toEqual([]);
        expect(custom).toHaveBeenCalledTimes(1);
        expect(result).toEqual({ succeeded: true, message: 'custom' });
    });

    async function scaffold() {
        projectRoot = await mkdtemp(path.join(tmpdir(), 'abstraction-finder-workflow-'));
        const lumpPath = path.join(projectRoot, '.lumpcode', 'lumps', 'abstractionFinder');
        await mkdir(lumpPath, { recursive: true });
        configPath = path.join(lumpPath, 'config.ts');
        await writeFile(configPath, 'export default {};\n');
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
    }) as Promise<unknown[]>;
}

function fakeRuntime() {
    const prompts: string[] = [];
    const shellCalls: string[] = [];
    const context: Context = { name: 'find-one', variables: {} };
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
        return { output: '', succeeded: true, exitCode: 0, timedOut: false };
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

async function run(config: { workflow?: WorkflowFn }, input: WorkflowInput) {
    if (typeof config.workflow !== 'function') {
        throw new Error('expected a workflow function');
    }
    return config.workflow(input);
}
