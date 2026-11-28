import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import type { WorkflowFn } from '@lumpcode/core';

import { backlog } from './workflowRecipe';

// Skipped until the impl stage fills in the workflow recipe. Unskip; do not rewrite.
describe('backlog workflow', () => {
    let projectRoot: string;
    let configPath: string;

    afterEach(async () => {
        if (projectRoot) {
            await rm(projectRoot, { recursive: true, force: true });
        }
    });

    it('returns a workflow config and no steps', async () => {
        await scaffold();
        const config = backlog({
            configUrl: pathToFileURL(configPath),
            stages: {
                draft: {
                    completion: 'keepPending',
                    workflow: async () => ({ succeeded: true, message: 'drafted' }),
                },
            },
            resolveItem: () => ({ stage: 'draft' }),
        });

        expect(config.steps).toBeUndefined();
        expect(config.workflow).toEqual(expect.any(Function));
    });

    it('rejects an absolute backlogItemsDir', async () => {
        await scaffold();
        expect(() => backlog({
            configUrl: pathToFileURL(configPath),
            backlogItemsDir: '/tmp/backlogItems',
            stages: {
                draft: {
                    completion: 'keepPending',
                    workflow: async () => undefined,
                },
            },
            resolveItem: () => ({ stage: 'draft' }),
        })).toThrow(/project-root-relative/);
    });

    it('runs the stage workflow for the context and leaves a keepPending item in todo', async () => {
        await scaffold();
        await writeItem('alpha');
        const config = backlog({
            configUrl: pathToFileURL(configPath),
            stages: {
                draft: {
                    completion: 'keepPending',
                    workflow: async () => ({ succeeded: true, message: 'drafted' }),
                },
            },
            resolveItem: () => ({ stage: 'draft' }),
        });

        const contexts = await list(config);
        const result = await run(config, contexts[0], projectRoot);

        expect(contexts).toHaveLength(1);
        expect(contexts[0]).toMatchObject({
            name: 'alpha',
            variables: {
                TASK_NAME: 'alpha',
                TASK: 'Alpha task',
                BACKLOG_STAGE: 'draft',
            },
        });
        expect(result).toEqual({ succeeded: true, message: 'drafted' });
        await expect(readFile(itemDesc('todo', 'alpha'), 'utf-8')).resolves.toContain('name: alpha');
    });

    it('moves a moveToDone item after the stage workflow, and keeps that workflow result', async () => {
        await scaffold();
        await writeItem('alpha');
        const stage: WorkflowFn = async () => ({ succeeded: false, message: 'shipped red' });
        const config = backlog({
            configUrl: pathToFileURL(configPath),
            stages: {
                ship: { completion: 'moveToDone', workflow: stage },
            },
            resolveItem: () => ({ stage: 'ship' }),
        });

        const contexts = await list(config);
        const result = await run(config, contexts[0], projectRoot);
        const completed = await readFile(itemDesc('completed', 'alpha'), 'utf-8');

        expect(result).toEqual({ succeeded: false, message: 'shipped red' });
        expect(completed).toContain('completedAt:');
        await expect(readFile(itemDesc('todo', 'alpha'), 'utf-8')).rejects.toThrow();
    });

    async function scaffold() {
        projectRoot = await mkdtemp(path.join(tmpdir(), 'backlog-workflow-'));
        const lumpPath = path.join(projectRoot, '.lumpcode', 'lumps', 'sample');
        await mkdir(lumpPath, { recursive: true });
        configPath = path.join(lumpPath, 'config.ts');
        await writeFile(configPath, 'export default {};\n');
    }

    async function writeItem(name: string) {
        const dir = path.join(projectRoot, '.lumpcode', 'lumps', 'sample', 'backlogItems', 'todo', name);
        await mkdir(dir, { recursive: true });
        await writeFile(
            path.join(dir, 'desc.yml'),
            `name: ${name}\ntask: Alpha task\npriority: 1\n`,
        );
    }

    function itemDesc(bucket: 'todo' | 'completed', name: string) {
        return path.join(
            projectRoot,
            '.lumpcode',
            'lumps',
            'sample',
            'backlogItems',
            bucket,
            name,
            'desc.yml',
        );
    }
});

async function list(config: { getContextListFn?: unknown }) {
    if (typeof config.getContextListFn !== 'function') {
        throw new Error('Expected getContextListFn');
    }
    return config.getContextListFn({
        codeBasePaths: [],
        lumpVariables: {},
        discoveryBranch: 'dev',
    }) as Promise<{ name: string; variables: Record<string, string> }[]>;
}

async function run(
    config: { workflow?: unknown },
    context: { name: string; variables: Record<string, string> } | undefined,
    workspacePath: string,
) {
    if (!context) {
        throw new Error('expected a context');
    }
    if (typeof config.workflow !== 'function') {
        throw new Error('expected a workflow function');
    }
    return config.workflow({
        context,
        lumpVariables: {},
        contextRunState: {},
        projectRoot: workspacePath,
        workspacePath,
        signal: new AbortController().signal,
        agent: {
            async session() {
                throw new Error('stage workflow owns the agent');
            },
            async prompt() {
                throw new Error('stage workflow owns the agent');
            },
        },
        shell: async () => {
            throw new Error('stage workflow owns the shell');
        },
        log: () => undefined,
    });
}
