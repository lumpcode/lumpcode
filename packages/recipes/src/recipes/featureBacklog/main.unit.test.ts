import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GetContextListFn } from '@lumpcode/cli-utils';
import { getContextStatus } from '@lumpcode/cli-utils';

import { resolveFeatureBacklogItem } from './main';
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
    name: string,
    files: { requirements?: boolean; testPlan?: boolean },
) {
    const itemDir = path.join(lumpPath, 'backlogItems', 'todo', name);
    await mkdir(itemDir, { recursive: true });
    if (files.requirements) {
        await writeFile(path.join(itemDir, 'requirements.md'), '# Requirements');
    }
    if (files.testPlan) {
        await writeFile(path.join(itemDir, 'testPlan.md'), '# Plan');
    }
}

describe('resolveFeatureBacklogItem', () => {
    let projectRoot: string;
    let lumpPath: string;

    const item: FeatureBacklogItem = {
        name: 'my-feature',
        task: 'Build feature',
        priority: 1,
    };

    const paths = {
        lumpPath: '.lumpcode/lumps/backlog',
        lumpName: 'backlog',
        backlogItemsDir: '.lumpcode/lumps/backlog/backlogItems',
    };

    const reqPath = '.lumpcode/lumps/backlog/backlogItems/todo/my-feature/requirements.md';
    const testPlanPath = '.lumpcode/lumps/backlog/backlogItems/todo/my-feature/testPlan.md';

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
        const resolution = await resolveFeatureBacklogItem(
            item,
            paths,
            projectRoot,
            'backlog',
            'dev',
        );

        expect(resolution).toEqual({
            stage: 'makeReq',
            contextName: 'my-feature_req',
            variables: {
                REQ_FILE: reqPath,
            },
        });
    });

    it('waits for a human requirements document when manualReq is true', async () => {
        const resolution = await resolveFeatureBacklogItem(
            { ...item, manualReq: true },
            paths,
            projectRoot,
            'backlog',
            'dev',
        );

        expect(resolution).toEqual({ ignored: true });
    });

    it('routes to makeTestPlan when requirements exist but test plan does not', async () => {
        await writeFeatureArtifact(lumpPath, 'my-feature', { requirements: true });

        const resolution = await resolveFeatureBacklogItem(
            item,
            paths,
            projectRoot,
            'backlog',
            'dev',
        );

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

        const resolution = await resolveFeatureBacklogItem(
            item,
            paths,
            projectRoot,
            'backlog',
            'dev',
        );

        expect(resolution).toEqual({
            stage: 'testImpl',
            contextName: 'my-feature_tests_impl',
            variables: {
                REQ_FILE: reqPath,
                TEST_PLAN_FILE: testPlanPath,
            },
        });
    });

    it('ignores the item while test implementation is branchPushed', async () => {
        await writeFeatureArtifact(lumpPath, 'my-feature', { requirements: true, testPlan: true });
        mockedGetContextStatus.mockResolvedValue('branchPushed');

        const resolution = await resolveFeatureBacklogItem(
            item,
            paths,
            projectRoot,
            'backlog',
            'dev',
        );

        expect(resolution).toEqual({ ignored: true });
    });

    it('routes to implementation when test implementation is finished', async () => {
        await writeFeatureArtifact(lumpPath, 'my-feature', { requirements: true, testPlan: true });
        mockedGetContextStatus.mockResolvedValue('finished');

        const resolution = await resolveFeatureBacklogItem(
            item,
            paths,
            projectRoot,
            'backlog',
            'dev',
        );

        expect(resolution).toEqual({
            stage: 'implementation',
            contextName: 'my-feature',
            variables: {
                REQ_FILE: reqPath,
                TEST_PLAN_FILE: testPlanPath,
            },
        });
    });
});

describe('featureBacklog parseItem reserved suffixes', () => {
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

        const { featureBacklog } = await import('./main');
        const config = featureBacklog({
            configUrl: pathToFileURL(configPath),
            baseBranch: 'dev',
            implValidateCommand: 'npm test',
        });

        await expect(
            asGetContextListFn(config.getContextListFn)({ codeBasePaths: [], lumpVariables: {}, discoveryBranch: 'main' }),
        ).rejects.toThrow(/reserved suffix _req/);

        await rm(projectRoot, { recursive: true, force: true });
    });
});
