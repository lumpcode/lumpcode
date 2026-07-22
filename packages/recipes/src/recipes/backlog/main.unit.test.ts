import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GetContextListFn, LumpJsConfigSteps } from '@lumpcode/cli-utils';
import { normalizeSteps } from '@lumpcode/cli-utils';

import { backlog } from './main';

async function writeTodoItem(
    projectRoot: string,
    lumpRelativePath: string,
    name: string,
    fields: Record<string, unknown>,
) {
    const itemDir = path.join(projectRoot, lumpRelativePath, 'backlogItems', 'todo', name);
    await mkdir(itemDir, { recursive: true });
    const body = { name, ...fields };
    const lines = Object.entries(body).map(([key, value]) => {
        if (typeof value === 'string' && value.includes('\n')) {
            return `${key}: >-\n  ${value.replace(/\n/g, '\n  ')}`;
        }
        if (Array.isArray(value)) {
            return `${key}:\n${value.map((entry) => `  - ${entry}`).join('\n')}`;
        }
        return `${key}: ${value}`;
    });
    await writeFile(path.join(itemDir, 'desc.yml'), `${lines.join('\n')}\n`);
}

async function scaffoldLump(projectRoot: string) {
    const lumpPath = path.join(projectRoot, '.lumpcode', 'lumps', 'sample');
    await mkdir(lumpPath, { recursive: true });
    const configPath = path.join(lumpPath, 'config.ts');
    await writeFile(configPath, 'export default {};\n');
    return { configPath, lumpRelativePath: '.lumpcode/lumps/sample' };
}

function asGetContextListFn(fn: unknown): GetContextListFn {
    if (typeof fn !== 'function') {
        throw new Error('Expected getContextListFn');
    }
    return fn as GetContextListFn;
}

function asDynamicStep(step: LumpJsConfigSteps[number]) {
    if (typeof step !== 'function') {
        throw new Error('Expected dynamic step function');
    }
    return step;
}

describe('backlog recipe', () => {
    let projectRoot: string;
    let configPath: string;
    let lumpRelativePath: string;

    beforeEach(async () => {
        projectRoot = await mkdtemp(path.join(tmpdir(), 'backlog-recipe-'));
        ({ configPath, lumpRelativePath } = await scaffoldLump(projectRoot));
    });

    afterEach(async () => {
        await rm(projectRoot, { recursive: true, force: true });
    });

    it('emits stage variables and dispatches stage steps', async () => {
        await writeTodoItem(projectRoot, lumpRelativePath, 'alpha', {
            task: 'Alpha task',
            priority: 2,
        });

        const config = backlog({
            configUrl: pathToFileURL(configPath),
            stages: {
                draft: {
                    completion: 'keepPending',
                    steps: [{ promptTemplate: 'Draft @{TASK}' }],
                },
                ship: {
                    completion: 'moveToDone',
                    steps: [{ promptTemplate: 'Ship @{TASK}' }],
                },
            },
            resolveItem({ item }) {
                return item.task.includes('Alpha')
                    ? { stage: 'draft', contextName: `${item.name}_draft` }
                    : { stage: 'ship' };
            },
        });

        const contexts = await asGetContextListFn(config.getContextListFn)({
            codeBasePaths: [],
            lumpVariables: {},
        });

        expect(contexts).toHaveLength(1);
        expect(contexts[0]).toMatchObject({
            name: 'alpha_draft',
            variables: {
                TASK_NAME: 'alpha',
                TASK: 'Alpha task',
                BACKLOG_ITEMS_DIR: '.lumpcode/lumps/sample/backlogItems',
                BACKLOG_ITEM_DIR: '.lumpcode/lumps/sample/backlogItems/todo/alpha',
                BACKLOG_STAGE: 'draft',
            },
            options: { priority: 2 },
        });

        const stepList = normalizeSteps({
            prompt: undefined,
            jsSteps: config.steps,
        });
        const resolvedSteps = normalizeSteps({
            prompt: undefined,
            jsSteps: await asDynamicStep(stepList[0])({
                context: contexts[0],
                lumpVariables: {},
                stepIndex: 0,
            }),
        });
        expect(resolvedSteps).toHaveLength(1);
        expect(resolvedSteps[0]).toMatchObject({ promptTemplate: 'Draft @{TASK}' });
    });

    it('appends folderSetTaskDoneStep only for moveToDone stages', async () => {
        await writeTodoItem(projectRoot, lumpRelativePath, 'beta', {
            task: 'Beta task',
            priority: 1,
        });

        const config = backlog({
            configUrl: pathToFileURL(configPath),
            stages: {
                ship: {
                    completion: 'moveToDone',
                    steps: [{ promptTemplate: 'Ship it' }],
                },
            },
            resolveItem() {
                return { stage: 'ship' };
            },
        });

        const contexts = await asGetContextListFn(config.getContextListFn)({
            codeBasePaths: [],
            lumpVariables: {},
        });

        const stepList = normalizeSteps({
            prompt: undefined,
            jsSteps: config.steps,
        });
        const resolvedSteps = normalizeSteps({
            prompt: undefined,
            jsSteps: await asDynamicStep(stepList[0])({
                context: contexts[0],
                lumpVariables: {},
                stepIndex: 0,
            }),
        });

        expect(resolvedSteps).toHaveLength(2);
        expect(resolvedSteps[1]).toMatchObject({ continueOnError: true });
    });

    it('fails discovery for malformed backlog entries', async () => {
        const itemDir = path.join(projectRoot, lumpRelativePath, 'backlogItems', 'todo', 'bad-name');
        await mkdir(itemDir, { recursive: true });
        await writeFile(
            path.join(itemDir, 'desc.yml'),
            'name: bad/name\ntask: x\npriority: 1\n',
        );

        const config = backlog({
            configUrl: pathToFileURL(configPath),
            stages: {
                ship: { completion: 'moveToDone', steps: [] },
            },
            resolveItem() {
                return { stage: 'ship' };
            },
        });

        await expect(
            asGetContextListFn(config.getContextListFn)({ codeBasePaths: [], lumpVariables: {} }),
        ).rejects.toThrow(/invalid name/);
    });

    it('supports project-root-relative backlogItemsDir overrides', async () => {
        const customItemsDir = '.lumpcode/lumps/sample/customBacklogItems';
        const itemDir = path.join(projectRoot, customItemsDir, 'todo', 'custom');
        await mkdir(itemDir, { recursive: true });
        await writeFile(
            path.join(itemDir, 'desc.yml'),
            'name: custom\ntask: Custom\npriority: 1\n',
        );

        const config = backlog({
            configUrl: pathToFileURL(configPath),
            backlogItemsDir: customItemsDir,
            stages: {
                ship: { completion: 'keepPending', steps: [] },
            },
            resolveItem() {
                return { stage: 'ship' };
            },
        });

        const contexts = await asGetContextListFn(config.getContextListFn)({
            codeBasePaths: [],
            lumpVariables: {},
        });

        expect(contexts[0]?.variables.BACKLOG_ITEMS_DIR).toBe(customItemsDir);
        expect(contexts[0]?.variables.BACKLOG_ITEM_DIR).toBe(
            '.lumpcode/lumps/sample/customBacklogItems/todo/custom',
        );
    });

    it('rejects absolute backlogItemsDir overrides', () => {
        expect(() =>
            backlog({
                configUrl: pathToFileURL(configPath),
                backlogItemsDir: '/tmp/backlogItems',
                stages: {
                    ship: { completion: 'keepPending', steps: [] },
                },
                resolveItem() {
                    return { stage: 'ship' };
                },
            }),
        ).toThrow(/project-root-relative/);
    });
});

describe('abstractionBacklog compatibility', () => {
    let projectRoot: string;
    let configPath: string;
    let lumpRelativePath: string;

    beforeEach(async () => {
        projectRoot = await mkdtemp(path.join(tmpdir(), 'abstraction-backlog-'));
        const lumpPath = path.join(projectRoot, '.lumpcode', 'lumps', 'abstractionImplementer');
        lumpRelativePath = '.lumpcode/lumps/abstractionImplementer';
        await mkdir(path.join(lumpPath, 'prds'), { recursive: true });
        configPath = path.join(lumpPath, 'config.ts');
        await writeFile(configPath, 'export default {};\n');
    });

    afterEach(async () => {
        await rm(projectRoot, { recursive: true, force: true });
    });

    it('ignores items without PRDs and emits implementation contexts for ready items', async () => {
        await writeTodoItem(projectRoot, lumpRelativePath, 'ready', {
            task: 'Ready task',
            priority: 1,
        });
        await writeTodoItem(projectRoot, lumpRelativePath, 'waiting', {
            task: 'Waiting task',
            priority: 2,
        });
        await writeFile(
            path.join(projectRoot, lumpRelativePath, 'backlogItems', 'todo', 'ready', 'prd.md'),
            '# PRD',
        );

        const { abstractionBacklog } = await import('../abstractionBacklog/main');
        const config = abstractionBacklog({
            configUrl: pathToFileURL(configPath),
            command: 'cursor',
        });

        const contexts = await asGetContextListFn(config.getContextListFn)({
            codeBasePaths: [],
            lumpVariables: {},
        });

        expect(contexts).toHaveLength(1);
        expect(contexts[0]).toMatchObject({
            name: 'ready',
            variables: {
                TASK_NAME: 'ready',
                PRD_FILE: '.lumpcode/lumps/abstractionImplementer/backlogItems/todo/ready/prd.md',
                BACKLOG_STAGE: 'implementation',
            },
        });
    });
});

describe('deprecated YAML helpers', () => {
    it('warns once for ymlBacklogContexts and still discovers items', async () => {
        const projectRoot = await mkdtemp(path.join(tmpdir(), 'deprecated-yml-'));
        const backlogFilePath = path.join(projectRoot, 'BACKLOG.yml');
        await writeFile(
            backlogFilePath,
            `- name: alpha\n  task: Alpha\n  priority: 1\n`,
        );

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { ymlBacklogContexts } = await import('../../kit/ymlBacklogContexts');

        const getContextListFn = ymlBacklogContexts({ backlogFilePath });
        const first = await getContextListFn({ codeBasePaths: [], lumpVariables: {} });
        const second = await getContextListFn({ codeBasePaths: [], lumpVariables: {} });

        expect(first).toHaveLength(1);
        expect(second).toHaveLength(1);
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0]?.[0]).toContain('ymlBacklogContexts is deprecated');

        warnSpy.mockRestore();
        await rm(projectRoot, { recursive: true, force: true });
    });
});
