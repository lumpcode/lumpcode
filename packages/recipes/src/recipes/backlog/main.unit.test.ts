import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { GetContextListFn, LumpJsConfigSteps } from '@lumpcode/cli-utils';
import { normalizeSteps } from '@lumpcode/cli-utils';

import { backlog } from './main';

async function scaffoldLump(projectRoot: string) {
    const lumpPath = path.join(projectRoot, '.lumpcode', 'lumps', 'sample');
    await mkdir(lumpPath, { recursive: true });
    const configPath = path.join(lumpPath, 'config.ts');
    await writeFile(configPath, 'export default {};\n');
    await writeFile(path.join(lumpPath, 'DONE.yml'), '[]\n');
    return { configPath };
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

    beforeEach(async () => {
        projectRoot = await mkdtemp(path.join(tmpdir(), 'backlog-recipe-'));
        ({ configPath } = await scaffoldLump(projectRoot));
    });

    afterEach(async () => {
        await rm(projectRoot, { recursive: true, force: true });
    });

    it('emits stage variables and dispatches stage steps', async () => {
        await writeFile(
            path.join(projectRoot, '.lumpcode/lumps/sample/BACKLOG.yml'),
            `- name: alpha\n  task: Alpha task\n  priority: 2\n`,
        );

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
                BACKLOG_FILE: '.lumpcode/lumps/sample/BACKLOG.yml',
                DONE_FILE: '.lumpcode/lumps/sample/DONE.yml',
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

    it('appends setTaskDoneStep only for moveToDone stages', async () => {
        await writeFile(
            path.join(projectRoot, '.lumpcode/lumps/sample/BACKLOG.yml'),
            `- name: beta\n  task: Beta task\n  priority: 1\n`,
        );

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
        await writeFile(
            path.join(projectRoot, '.lumpcode/lumps/sample/BACKLOG.yml'),
            `- name: bad/name\n  task: x\n  priority: 1\n`,
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

    it('supports project-root-relative backlog path overrides', async () => {
        const customBacklog = '.lumpcode/lumps/sample/CUSTOM_BACKLOG.yml';
        await writeFile(
            path.join(projectRoot, customBacklog),
            `- name: custom\n  task: Custom\n  priority: 1\n`,
        );

        const config = backlog({
            configUrl: pathToFileURL(configPath),
            backlogFilePath: customBacklog,
            doneFilePath: '.lumpcode/lumps/sample/CUSTOM_DONE.yml',
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

        expect(contexts[0]?.variables.BACKLOG_FILE).toBe(customBacklog);
        expect(contexts[0]?.variables.DONE_FILE).toBe('.lumpcode/lumps/sample/CUSTOM_DONE.yml');
    });

    it('rejects absolute backlog path overrides', () => {
        expect(() =>
            backlog({
                configUrl: pathToFileURL(configPath),
                backlogFilePath: '/tmp/BACKLOG.yml',
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

    beforeEach(async () => {
        projectRoot = await mkdtemp(path.join(tmpdir(), 'abstraction-backlog-'));
        const lumpPath = path.join(projectRoot, '.lumpcode', 'lumps', 'abstractionImplementer');
        await mkdir(path.join(lumpPath, 'prds'), { recursive: true });
        configPath = path.join(lumpPath, 'config.ts');
        await writeFile(configPath, 'export default {};\n');
        await writeFile(path.join(lumpPath, 'DONE.yml'), '[]\n');
    });

    afterEach(async () => {
        await rm(projectRoot, { recursive: true, force: true });
    });

    it('ignores items without PRDs and emits implementation contexts for ready items', async () => {
        const lumpPath = path.join(projectRoot, '.lumpcode/lumps/abstractionImplementer');
        await writeFile(
            path.join(lumpPath, 'BACKLOG.yml'),
            `- name: ready\n  task: Ready task\n  priority: 1\n- name: waiting\n  task: Waiting task\n  priority: 2\n`,
        );
        await writeFile(path.join(lumpPath, 'prds', 'ready.prd.md'), '# PRD');

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
                PRD_FILE: '.lumpcode/lumps/abstractionImplementer/prds/ready.prd.md',
                BACKLOG_STAGE: 'implementation',
            },
        });
    });
});
