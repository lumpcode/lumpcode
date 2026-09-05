import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GetContextListFn, LumpJsConfigSteps } from '@lumpcode/cli-utils';
import { getContextStatus, normalizeSteps } from '@lumpcode/cli-utils';

import {
    DEFAULT_ITEM_DISCOVERY_BRANCH_PREFIX,
    DEFAULT_PRIMARY_DISCOVERY_BRANCH,
    featureBacklog,
    parseFeatureWorkflow,
    resolveFeatureBacklogDiscoveryOptions,
    resolveFeatureBacklogItem,
} from './main';
import type { FeatureBacklogItem } from './main';

vi.mock('@lumpcode/cli-utils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@lumpcode/cli-utils')>();
    return {
        ...actual,
        getContextStatus: vi.fn(),
    };
});

const mockedGetContextStatus = vi.mocked(getContextStatus);

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

async function writeFeatureArtifact(
    lumpPath: string,
    todoRelativeDir: string,
    files: { requirements?: boolean; testPlan?: boolean },
) {
    const itemDir = path.join(lumpPath, 'backlogItems', 'todo', todoRelativeDir);
    await mkdir(itemDir, { recursive: true });
    if (files.requirements) {
        await writeFile(path.join(itemDir, 'requirements.md'), '# Requirements');
    }
    if (files.testPlan) {
        await writeFile(path.join(itemDir, 'testPlan.md'), '# Plan');
    }
}

async function writeTodoDesc(
    lumpPath: string,
    todoRelativeDir: string,
    body: string,
) {
    const itemDir = path.join(lumpPath, 'backlogItems', 'todo', todoRelativeDir);
    await mkdir(itemDir, { recursive: true });
    await writeFile(path.join(itemDir, 'desc.yml'), body);
}

describe('parseFeatureWorkflow', () => {
    it('returns undefined when workflow is omitted', () => {
        expect(parseFeatureWorkflow('alpha', { name: 'alpha' })).toBeUndefined();
    });

    it('normalizes order and drops impl when directImpl is present', () => {
        expect(parseFeatureWorkflow('alpha', {
            workflow: ['directImpl', 'impl', 'testImpl', 'req'],
        })).toEqual(['req', 'testImpl', 'directImpl']);
    });

    it('rejects a string workflow', () => {
        expect(() => parseFeatureWorkflow('alpha', { workflow: 'tdd' })).toThrow(
            /workflow" must be an array of stages/,
        );
    });

    it('rejects unknown and duplicate stages', () => {
        expect(() => parseFeatureWorkflow('alpha', { workflow: ['nope'] })).toThrow(
            /unknown stage "nope"/,
        );
        expect(() => parseFeatureWorkflow('alpha', { workflow: ['req', 'req'] })).toThrow(
            /duplicate stages/,
        );
    });

    it('warns once when manualReq is present', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        parseFeatureWorkflow('alpha', { manualReq: true });
        parseFeatureWorkflow('beta', { manualReq: false });
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0]?.[0]).toContain('manualReq');
        warnSpy.mockRestore();
    });
});

describe('resolveFeatureBacklogDiscoveryOptions', () => {
    it('defaults to dev and feature', () => {
        expect(resolveFeatureBacklogDiscoveryOptions({})).toEqual({
            primaryDiscoveryBranch: 'dev',
            itemDiscoveryBranchPrefix: 'feature',
        });
    });

    it('rejects a prefix or primary branch that ends with a slash', () => {
        expect(() =>
            resolveFeatureBacklogDiscoveryOptions({ itemDiscoveryBranchPrefix: 'feature/' }),
        ).toThrow(/trailing \//);
        expect(() =>
            resolveFeatureBacklogDiscoveryOptions({ primaryDiscoveryBranch: 'dev/' }),
        ).toThrow(/trailing \//);
    });
});

describe('resolveFeatureBacklogItem', () => {
    let projectRoot: string;
    let lumpPath: string;

    const item: FeatureBacklogItem = {
        name: 'my-feature',
        task: 'Build feature',
        priority: 1,
        todoRelativeDir: 'my-feature',
    };

    const paths = {
        lumpPath: '.lumpcode/lumps/backlog',
        lumpName: 'backlog',
        backlogItemsDir: '.lumpcode/lumps/backlog/backlogItems',
    };

    const tddBranch = 'feature/my-feature';
    const reqPath = '.lumpcode/lumps/backlog/backlogItems/todo/my-feature/requirements.md';
    const testPlanPath = '.lumpcode/lumps/backlog/backlogItems/todo/my-feature/testPlan.md';
    const defaultWorkflow = 'req,testPlan,testImpl';

    function resolve(extra: {
        item?: FeatureBacklogItem;
        discoveryBranch?: string;
    } = {}) {
        return resolveFeatureBacklogItem({
            item: extra.item ?? item,
            paths,
            projectRoot,
            discoveryBranch: extra.discoveryBranch ?? tddBranch,
            primaryDiscoveryBranch: DEFAULT_PRIMARY_DISCOVERY_BRANCH,
            itemDiscoveryBranchPrefix: DEFAULT_ITEM_DISCOVERY_BRANCH_PREFIX,
        });
    }

    beforeEach(async () => {
        projectRoot = await mkdtemp(path.join(tmpdir(), 'feature-backlog-'));
        lumpPath = path.join(projectRoot, '.lumpcode', 'lumps', 'backlog');
        await mkdir(lumpPath, { recursive: true });
        mockedGetContextStatus.mockReset();
    });

    afterEach(async () => {
        await rm(projectRoot, { recursive: true, force: true });
    });

    it('routes to req when no requirements document exists', async () => {
        const resolution = await resolve();

        expect(resolution).toEqual({
            stage: 'req',
            contextName: 'my-feature_req',
            variables: {
                WORKFLOW: defaultWorkflow,
                REQ_FILE: reqPath,
            },
        });
    });

    it('waits when later stages need requirements and req is not in the workflow', async () => {
        const resolution = await resolve({
            item: { ...item, workflow: ['testPlan', 'testImpl'] },
        });

        expect(resolution).toEqual({ ignored: true });
    });

    it('waits for requirements before default impl when the array is empty', async () => {
        const resolution = await resolve({
            item: { ...item, workflow: [] },
            discoveryBranch: 'dev',
        });

        expect(resolution).toEqual({ ignored: true });
    });

    it('routes to testPlan when requirements exist but test plan does not', async () => {
        await writeFeatureArtifact(lumpPath, 'my-feature', { requirements: true });

        const resolution = await resolve();

        expect(resolution).toEqual({
            stage: 'testPlan',
            contextName: 'my-feature_testPlan',
            variables: {
                WORKFLOW: defaultWorkflow,
                REQ_FILE: reqPath,
                TEST_PLAN_FILE: testPlanPath,
            },
        });
    });

    it('routes to testImpl when test plan exists and tests are toDo', async () => {
        await writeFeatureArtifact(lumpPath, 'my-feature', { requirements: true, testPlan: true });
        mockedGetContextStatus.mockResolvedValue('toDo');

        const resolution = await resolve();

        expect(resolution).toEqual({
            stage: 'testImpl',
            contextName: 'my-feature_testImpl',
            variables: {
                WORKFLOW: defaultWorkflow,
                REQ_FILE: reqPath,
                TEST_PLAN_FILE: testPlanPath,
            },
        });
        expect(mockedGetContextStatus).toHaveBeenCalledWith(
            expect.objectContaining({
                contextName: 'my-feature_testImpl',
                lumpName: 'backlog',
                baseBranch: tddBranch,
            }),
        );
    });

    it('ignores the item while test implementation is branchPushed', async () => {
        await writeFeatureArtifact(lumpPath, 'my-feature', { requirements: true, testPlan: true });
        mockedGetContextStatus.mockResolvedValue('branchPushed');

        const resolution = await resolve();

        expect(resolution).toEqual({ ignored: true });
    });

    it('routes to impl when test implementation is finished', async () => {
        await writeFeatureArtifact(lumpPath, 'my-feature', { requirements: true, testPlan: true });
        mockedGetContextStatus.mockResolvedValue('finished');

        const resolution = await resolve();

        expect(resolution).toEqual({
            stage: 'impl',
            contextName: 'my-feature',
            variables: {
                WORKFLOW: defaultWorkflow,
                REQ_FILE: reqPath,
                TEST_PLAN_FILE: testPlanPath,
            },
        });
    });

    it('ignores default-workflow items on the primary discovery branch', async () => {
        const resolution = await resolve({ discoveryBranch: 'dev' });
        expect(resolution).toEqual({ ignored: true });
    });

    it('ignores items on discovery branches that are not primary or item campaigns', async () => {
        const resolution = await resolve({ discoveryBranch: 'main' });
        expect(resolution).toEqual({ ignored: true });
    });

    it('ignores items whose name does not match the campaign branch', async () => {
        const resolution = await resolve({ discoveryBranch: 'feature/other' });
        expect(resolution).toEqual({ ignored: true });
    });

    it('ignores manual: true even on a matching feature branch', async () => {
        const resolution = await resolve({
            item: { ...item, manual: true },
        });
        expect(resolution).toEqual({ ignored: true });
    });

    it('ignores items stamped with completedAt', async () => {
        const resolution = await resolve({
            item: { ...item, completedAt: '2026-01-01T00:00:00.000Z' },
        });
        expect(resolution).toEqual({ ignored: true });
    });

    it('routes [req] items on the primary branch when requirements exist', async () => {
        await writeFeatureArtifact(lumpPath, 'my-feature', { requirements: true });

        const resolution = await resolve({
            item: { ...item, workflow: ['req'] },
            discoveryBranch: 'dev',
        });

        expect(resolution).toEqual({
            stage: 'impl',
            contextName: 'my-feature',
            variables: {
                WORKFLOW: 'req',
                REQ_FILE: reqPath,
            },
        });
    });

    it('still writes requirements for [req] items that lack them', async () => {
        const resolution = await resolve({
            item: { ...item, workflow: ['req'] },
            discoveryBranch: 'dev',
        });

        expect(resolution).toEqual({
            stage: 'req',
            contextName: 'my-feature_req',
            variables: {
                WORKFLOW: 'req',
                REQ_FILE: reqPath,
            },
        });
    });

    it('implements from desc.yml when the terminal is directImpl and req is missing', async () => {
        const resolution = await resolve({
            item: { ...item, workflow: ['directImpl'] },
            discoveryBranch: 'dev',
        });

        expect(resolution).toEqual({
            stage: 'directImpl',
            contextName: 'my-feature',
            variables: {
                WORKFLOW: 'directImpl',
            },
        });
    });

    it('routes tickets on feature/<parent> with nested artifact paths', async () => {
        const ticket: FeatureBacklogItem = {
            name: 't1',
            task: 'Ticket one',
            priority: 1,
            todoRelativeDir: 'umbrella/tickets/t1',
            parentName: 'umbrella',
        };
        await writeFeatureArtifact(lumpPath, 'umbrella/tickets/t1', { requirements: true });

        const resolution = await resolve({
            item: ticket,
            discoveryBranch: 'feature/umbrella',
        });

        expect(resolution).toEqual({
            stage: 'testPlan',
            contextName: 'umbrella-t1_testPlan',
            variables: {
                WORKFLOW: defaultWorkflow,
                REQ_FILE:
                    '.lumpcode/lumps/backlog/backlogItems/todo/umbrella/tickets/t1/requirements.md',
                TEST_PLAN_FILE:
                    '.lumpcode/lumps/backlog/backlogItems/todo/umbrella/tickets/t1/testPlan.md',
            },
        });
    });

    it('inherits parent workflow for tickets that omit workflow', async () => {
        const ticket: FeatureBacklogItem = {
            name: 't1',
            task: 'Ticket one',
            priority: 1,
            todoRelativeDir: 'umbrella/tickets/t1',
            parentName: 'umbrella',
        };
        await writeTodoDesc(
            lumpPath,
            'umbrella',
            'name: umbrella\ntask: Parent\npriority: 1\nworkflow:\n  - req\n',
        );
        await writeFeatureArtifact(lumpPath, 'umbrella/tickets/t1', { requirements: true });

        const resolution = await resolve({
            item: ticket,
            discoveryBranch: 'feature/umbrella',
        });

        expect(resolution).toEqual({
            stage: 'impl',
            contextName: 'umbrella-t1',
            variables: {
                WORKFLOW: 'req',
                REQ_FILE:
                    '.lumpcode/lumps/backlog/backlogItems/todo/umbrella/tickets/t1/requirements.md',
            },
        });
    });

    it('ignores tickets on the primary discovery branch', async () => {
        const ticket: FeatureBacklogItem = {
            name: 't1',
            task: 'Ticket one',
            priority: 1,
            todoRelativeDir: 'umbrella/tickets/t1',
            parentName: 'umbrella',
            workflow: ['req'],
        };
        await writeFeatureArtifact(lumpPath, 'umbrella/tickets/t1', { requirements: true });

        const resolution = await resolve({
            item: ticket,
            discoveryBranch: 'dev',
        });

        expect(resolution).toEqual({ ignored: true });
    });

    it('routes umbrella parent to completion with ticket dependsOn', async () => {
        const parent: FeatureBacklogItem = {
            name: 'umbrella',
            task: 'Parent feature',
            priority: 1,
            todoRelativeDir: 'umbrella',
            manual: true,
        };
        await writeTodoDesc(
            lumpPath,
            'umbrella',
            'name: umbrella\ntask: Parent feature\npriority: 1\nmanual: true\n',
        );
        await mkdir(path.join(lumpPath, 'backlogItems', 'todo', 'umbrella', 'tickets'), {
            recursive: true,
        });
        const completedTicketDir = path.join(
            lumpPath,
            'backlogItems',
            'completed',
            'umbrella',
            'tickets',
            't1',
        );
        await mkdir(completedTicketDir, { recursive: true });
        await writeFile(
            path.join(completedTicketDir, 'desc.yml'),
            'name: t1\ntask: Done ticket\npriority: 1\ncompletedAt: 2026-01-01T00:00:00.000Z\n',
        );

        const resolution = await resolve({
            item: parent,
            discoveryBranch: 'feature/umbrella',
        });

        expect(resolution).toEqual({
            stage: 'completion',
            contextName: 'umbrella',
            additionalDependsOnContexts: ['umbrella-t1'],
        });
    });

    it('ignores umbrella parent completion on the primary branch', async () => {
        const parent: FeatureBacklogItem = {
            name: 'umbrella',
            task: 'Parent feature',
            priority: 1,
            todoRelativeDir: 'umbrella',
        };
        await writeTodoDesc(lumpPath, 'umbrella', 'name: umbrella\ntask: Parent\npriority: 1\n');
        await writeTodoDesc(lumpPath, 'umbrella/tickets/t1', 'name: t1\ntask: Ticket\npriority: 1\n');

        const resolution = await resolve({
            item: parent,
            discoveryBranch: 'dev',
        });

        expect(resolution).toEqual({ ignored: true });
    });
});

describe('featureBacklog parseItem', () => {
    it('rejects item names ending in reserved suffixes via featureBacklog config', async () => {
        const projectRoot = await mkdtemp(path.join(tmpdir(), 'feature-backlog-config-'));
        const lumpPath = path.join(projectRoot, '.lumpcode', 'lumps', 'backlog');
        await mkdir(path.join(lumpPath, 'backlogItems', 'todo', 'bad_req'), { recursive: true });
        const configPath = path.join(lumpPath, 'config.ts');
        await writeFile(configPath, 'export default {};\n');
        await writeFile(
            path.join(lumpPath, 'backlogItems', 'todo', 'bad_req', 'desc.yml'),
            'name: bad_req\ntask: x\npriority: 1\n',
        );

        const config = featureBacklog({
            configUrl: pathToFileURL(configPath),
            implValidateCommand: 'npm test',
        });

        await expect(
            asGetContextListFn(config.getContextListFn)({
                codeBasePaths: [],
                lumpVariables: {},
                discoveryBranch: 'feature/bad_req',
            }),
        ).rejects.toThrow(/reserved suffix _req/);

        await rm(projectRoot, { recursive: true, force: true });
    });

    it('emits default discoveryBranches and rejects a string workflow', async () => {
        const projectRoot = await mkdtemp(path.join(tmpdir(), 'feature-backlog-workflow-'));
        const lumpPath = path.join(projectRoot, '.lumpcode', 'lumps', 'backlog');
        await mkdir(path.join(lumpPath, 'backlogItems', 'todo', 'alpha'), { recursive: true });
        const configPath = path.join(lumpPath, 'config.ts');
        await writeFile(configPath, 'export default {};\n');
        await writeFile(
            path.join(lumpPath, 'backlogItems', 'todo', 'alpha', 'desc.yml'),
            'name: alpha\ntask: x\npriority: 1\nworkflow: nope\n',
        );

        const config = featureBacklog({
            configUrl: pathToFileURL(configPath),
            implValidateCommand: 'npm test',
        });

        expect(config.discoveryBranches).toEqual(['dev', 'feature/*']);

        await expect(
            asGetContextListFn(config.getContextListFn)({
                codeBasePaths: [],
                lumpVariables: {},
                discoveryBranch: 'feature/alpha',
            }),
        ).rejects.toThrow(/workflow" must be an array of stages/);

        await rm(projectRoot, { recursive: true, force: true });
    });

    it('discovers tickets with prefixed dependsOn and nested BACKLOG_ITEM_DIR', async () => {
        const projectRoot = await mkdtemp(path.join(tmpdir(), 'feature-backlog-tickets-'));
        const lumpPath = path.join(projectRoot, '.lumpcode', 'lumps', 'backlog');
        const ticketDir = path.join(lumpPath, 'backlogItems', 'todo', 'umbrella', 'tickets', 't1');
        await mkdir(ticketDir, { recursive: true });
        const configPath = path.join(lumpPath, 'config.ts');
        await writeFile(configPath, 'export default {};\n');
        await writeTodoDesc(lumpPath, 'umbrella', 'name: umbrella\ntask: Parent\npriority: 2\n');
        await writeFile(
            path.join(ticketDir, 'desc.yml'),
            'name: t1\ntask: Ticket one\npriority: 1\ndependsOn:\n  - other\n',
        );

        const config = featureBacklog({
            configUrl: pathToFileURL(configPath),
            implValidateCommand: 'npm test',
        });

        const contexts = await asGetContextListFn(config.getContextListFn)({
            codeBasePaths: [],
            lumpVariables: {},
            discoveryBranch: 'feature/umbrella',
        });

        expect(contexts).toHaveLength(2);
        expect(contexts.find((ctx) => ctx.name === 'umbrella-t1_req')).toMatchObject({
            variables: {
                TASK_NAME: 't1',
                BACKLOG_ITEM_DIR:
                    '.lumpcode/lumps/backlog/backlogItems/todo/umbrella/tickets/t1',
                BACKLOG_STAGE: 'req',
                REQ_FILE:
                    '.lumpcode/lumps/backlog/backlogItems/todo/umbrella/tickets/t1/requirements.md',
            },
            options: {
                priority: 1,
                dependsOnContexts: ['umbrella-other'],
            },
        });
        expect(contexts.find((ctx) => ctx.name === 'umbrella')).toMatchObject({
            variables: {
                BACKLOG_STAGE: 'completion',
            },
            options: {
                priority: 2,
                dependsOnContexts: ['umbrella-t1'],
            },
        });

        await rm(projectRoot, { recursive: true, force: true });
    });

    it('emits parent completion after all tickets have completed', async () => {
        const projectRoot = await mkdtemp(path.join(tmpdir(), 'feature-backlog-parent-done-'));
        const lumpPath = path.join(projectRoot, '.lumpcode', 'lumps', 'backlog');
        const configPath = path.join(lumpPath, 'config.ts');
        await writeTodoDesc(
            lumpPath,
            'umbrella',
            'name: umbrella\ntask: Parent\npriority: 1\nmanual: true\n',
        );
        await writeFeatureArtifact(lumpPath, 'umbrella', { requirements: true });
        await mkdir(path.join(lumpPath, 'backlogItems', 'todo', 'umbrella', 'tickets'), {
            recursive: true,
        });
        const completedTicketDir = path.join(
            lumpPath,
            'backlogItems',
            'completed',
            'umbrella',
            'tickets',
            't1',
        );
        await mkdir(completedTicketDir, { recursive: true });
        await writeFile(
            path.join(completedTicketDir, 'desc.yml'),
            'name: t1\ntask: Done ticket\npriority: 1\ncompletedAt: 2026-01-01T00:00:00.000Z\n',
        );
        await writeFile(configPath, 'export default {};\n');

        const config = featureBacklog({
            configUrl: pathToFileURL(configPath),
            implValidateCommand: 'npm test',
        });

        const contexts = await asGetContextListFn(config.getContextListFn)({
            codeBasePaths: [],
            lumpVariables: {},
            discoveryBranch: 'feature/umbrella',
        });

        expect(contexts).toHaveLength(1);
        expect(contexts[0]).toMatchObject({
            name: 'umbrella',
            variables: {
                TASK_NAME: 'umbrella',
                BACKLOG_STAGE: 'completion',
                BACKLOG_ITEM_DIR: '.lumpcode/lumps/backlog/backlogItems/todo/umbrella',
            },
            options: {
                priority: 1,
                dependsOnContexts: ['umbrella-t1'],
            },
        });

        await rm(projectRoot, { recursive: true, force: true });
    });
});

describe('featureBacklog promptFns', () => {
    it('uses an override promptFn for the matching stage', async () => {
        const projectRoot = await mkdtemp(path.join(tmpdir(), 'feature-backlog-prompts-'));
        const lumpPath = path.join(projectRoot, '.lumpcode', 'lumps', 'backlog');
        const configPath = path.join(lumpPath, 'config.ts');
        await writeTodoDesc(
            lumpPath,
            'alpha',
            'name: alpha\ntask: Alpha\npriority: 1\nworkflow:\n  - req\n  - testImpl\n',
        );
        await writeFeatureArtifact(lumpPath, 'alpha', { requirements: true });
        await writeFile(configPath, 'export default {};\n');
        mockedGetContextStatus.mockResolvedValue('toDo');

        const config = featureBacklog({
            configUrl: pathToFileURL(configPath),
            implValidateCommand: 'npm test',
            promptFns: {
                testImpl: () => 'CUSTOM TEST IMPL',
            },
        });

        const contexts = await asGetContextListFn(config.getContextListFn)({
            codeBasePaths: [],
            lumpVariables: {},
            discoveryBranch: 'feature/alpha',
        });
        expect(contexts[0]?.variables.BACKLOG_STAGE).toBe('testImpl');

        const stepList = normalizeSteps({
            prompt: undefined,
            jsSteps: config.steps,
        });
        const resolvedSteps = normalizeSteps({
            prompt: undefined,
            jsSteps: await asDynamicStep(stepList[0])({
                context: contexts[0]!,
                lumpVariables: {},
                stepIndex: 0,
                contextRunState: {},
            }),
        });
        const first = resolvedSteps[0];
        if (!first || typeof first === 'function' || typeof first === 'string' || !first.promptFn) {
            throw new Error('Expected a step with promptFn');
        }
        expect(
            await first.promptFn({
                context: contexts[0]!,
                lumpVariables: {},
                stepIndex: 0,
                contextRunState: {},
            }),
        ).toBe('CUSTOM TEST IMPL');

        await rm(projectRoot, { recursive: true, force: true });
    });
});
