import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GetContextListFn } from '@lumpcode/cli-utils';
import { getContextStatus } from '@lumpcode/cli-utils';

import { featureBacklog, resolveFeatureBacklogItem } from './main';
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

    function resolve(extra: {
        item?: FeatureBacklogItem;
        discoveryBranch?: string;
    } = {}) {
        return resolveFeatureBacklogItem({
            item: extra.item ?? item,
            paths,
            projectRoot,
            discoveryBranch: extra.discoveryBranch ?? tddBranch,
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

    it('routes to makeReq when no requirements document exists', async () => {
        const resolution = await resolve();

        expect(resolution).toEqual({
            stage: 'makeReq',
            contextName: 'my-feature_req',
            variables: {
                REQ_FILE: reqPath,
            },
        });
    });

    it('waits for a human requirements document when manualReq is true', async () => {
        const resolution = await resolve({
            item: { ...item, manualReq: true },
        });

        expect(resolution).toEqual({ ignored: true });
    });

    it('routes to makeTestPlan when requirements exist but test plan does not', async () => {
        await writeFeatureArtifact(lumpPath, 'my-feature', { requirements: true });

        const resolution = await resolve();

        expect(resolution).toEqual({
            stage: 'makeTestPlan',
            contextName: 'my-feature_testPlan',
            variables: {
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
            contextName: 'my-feature_tests_impl',
            variables: {
                REQ_FILE: reqPath,
                TEST_PLAN_FILE: testPlanPath,
            },
        });
        expect(mockedGetContextStatus).toHaveBeenCalledWith(
            expect.objectContaining({
                contextName: 'my-feature_tests_impl',
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

    it('routes to implementation when test implementation is finished', async () => {
        await writeFeatureArtifact(lumpPath, 'my-feature', { requirements: true, testPlan: true });
        mockedGetContextStatus.mockResolvedValue('finished');

        const resolution = await resolve();

        expect(resolution).toEqual({
            stage: 'implementation',
            contextName: 'my-feature',
            variables: {
                REQ_FILE: reqPath,
                TEST_PLAN_FILE: testPlanPath,
            },
        });
    });

    it('ignores tdd items on the dev discovery branch', async () => {
        const resolution = await resolve({ discoveryBranch: 'dev' });
        expect(resolution).toEqual({ ignored: true });
    });

    it('ignores items on discovery branches that are not dev or feature/*', async () => {
        const resolution = await resolve({ discoveryBranch: 'main' });
        expect(resolution).toEqual({ ignored: true });
    });

    it('ignores tdd items whose name does not match feature/<key>', async () => {
        const resolution = await resolve({ discoveryBranch: 'feature/other' });
        expect(resolution).toEqual({ ignored: true });
    });

    it('ignores workflow: manual even on a matching feature branch', async () => {
        const resolution = await resolve({
            item: { ...item, workflow: 'manual' },
        });
        expect(resolution).toEqual({ ignored: true });
    });

    it('ignores items stamped with completedAt', async () => {
        const resolution = await resolve({
            item: { ...item, completedAt: '2026-01-01T00:00:00.000Z' },
        });
        expect(resolution).toEqual({ ignored: true });
    });

    it('routes directImpl items on dev when requirements exist', async () => {
        await writeFeatureArtifact(lumpPath, 'my-feature', { requirements: true });

        const resolution = await resolve({
            item: { ...item, workflow: 'directImpl' },
            discoveryBranch: 'dev',
        });

        expect(resolution).toEqual({
            stage: 'directImpl',
            contextName: 'my-feature',
            variables: { REQ_FILE: reqPath },
        });
    });

    it('still writes requirements for directImpl items that lack them', async () => {
        const resolution = await resolve({
            item: { ...item, workflow: 'directImpl' },
            discoveryBranch: 'dev',
        });

        expect(resolution).toEqual({
            stage: 'makeReq',
            contextName: 'my-feature_req',
            variables: { REQ_FILE: reqPath },
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

        const resolution = await resolveFeatureBacklogItem({
            item: ticket,
            paths,
            projectRoot,
            discoveryBranch: 'feature/umbrella',
        });

        expect(resolution).toEqual({
            stage: 'makeTestPlan',
            contextName: 'umbrella-t1_testPlan',
            variables: {
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
            'name: umbrella\ntask: Parent\npriority: 1\nworkflow: directImpl\n',
        );
        await writeFeatureArtifact(lumpPath, 'umbrella/tickets/t1', { requirements: true });

        const resolution = await resolveFeatureBacklogItem({
            item: ticket,
            paths,
            projectRoot,
            discoveryBranch: 'feature/umbrella',
        });

        expect(resolution).toEqual({
            stage: 'directImpl',
            contextName: 'umbrella-t1',
            variables: {
                REQ_FILE:
                    '.lumpcode/lumps/backlog/backlogItems/todo/umbrella/tickets/t1/requirements.md',
            },
        });
    });

    it('ignores directImpl tickets on the dev discovery branch', async () => {
        const ticket: FeatureBacklogItem = {
            name: 't1',
            task: 'Ticket one',
            priority: 1,
            todoRelativeDir: 'umbrella/tickets/t1',
            parentName: 'umbrella',
            workflow: 'directImpl',
        };
        await writeFeatureArtifact(lumpPath, 'umbrella/tickets/t1', { requirements: true });

        const resolution = await resolveFeatureBacklogItem({
            item: ticket,
            paths,
            projectRoot,
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

    it('rejects invalid workflow values', async () => {
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

        await expect(
            asGetContextListFn(config.getContextListFn)({
                codeBasePaths: [],
                lumpVariables: {},
                discoveryBranch: 'feature/alpha',
            }),
        ).rejects.toThrow(/workflow" must be one of/);

        await rm(projectRoot, { recursive: true, force: true });
    });

    it('discovers tickets with prefixed dependsOn and nested BACKLOG_ITEM_DIR', async () => {
        const projectRoot = await mkdtemp(path.join(tmpdir(), 'feature-backlog-tickets-'));
        const lumpPath = path.join(projectRoot, '.lumpcode', 'lumps', 'backlog');
        const ticketDir = path.join(lumpPath, 'backlogItems', 'todo', 'umbrella', 'tickets', 't1');
        await mkdir(ticketDir, { recursive: true });
        const configPath = path.join(lumpPath, 'config.ts');
        await writeFile(configPath, 'export default {};\n');
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

        expect(contexts).toHaveLength(1);
        expect(contexts[0]).toMatchObject({
            name: 'umbrella-t1_req',
            variables: {
                TASK_NAME: 't1',
                BACKLOG_ITEM_DIR:
                    '.lumpcode/lumps/backlog/backlogItems/todo/umbrella/tickets/t1',
                BACKLOG_STAGE: 'makeReq',
                REQ_FILE:
                    '.lumpcode/lumps/backlog/backlogItems/todo/umbrella/tickets/t1/requirements.md',
            },
            options: {
                priority: 1,
                dependsOnContexts: ['umbrella-other'],
            },
        });

        await rm(projectRoot, { recursive: true, force: true });
    });
});
