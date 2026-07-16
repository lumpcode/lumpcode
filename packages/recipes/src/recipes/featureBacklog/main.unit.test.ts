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
        backlogFilePath: '.lumpcode/lumps/backlog/BACKLOG.yml',
        doneFilePath: '.lumpcode/lumps/backlog/DONE.yml',
    };

    beforeEach(async () => {
        projectRoot = await mkdtemp(path.join(tmpdir(), 'feature-backlog-'));
        lumpPath = path.join(projectRoot, '.lumpcode', 'lumps', 'backlog');
        await mkdir(path.join(lumpPath, 'prds'), { recursive: true });
        await mkdir(path.join(lumpPath, 'testPlans'), { recursive: true });
        mockedGetContextStatus.mockReset();
    });

    afterEach(async () => {
        await rm(projectRoot, { recursive: true, force: true });
    });

    it('routes to makePrd when no PRD exists', async () => {
        const resolution = await resolveFeatureBacklogItem(
            item,
            paths,
            projectRoot,
            'backlog',
            'dev',
        );

        expect(resolution).toEqual({
            stage: 'makePrd',
            contextName: 'my-feature_prd',
            variables: {
                PRD_FILE: '.lumpcode/lumps/backlog/prds/my-feature.prd.md',
            },
        });
    });

    it('waits for a human PRD when manualPrd is true', async () => {
        const resolution = await resolveFeatureBacklogItem(
            { ...item, manualPrd: true },
            paths,
            projectRoot,
            'backlog',
            'dev',
        );

        expect(resolution).toEqual({ ignored: true });
    });

    it('routes to makeTestPlan when PRD exists but test plan does not', async () => {
        await writeFile(
            path.join(lumpPath, 'prds', 'my-feature.prd.md'),
            '# PRD',
        );

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
                PRD_FILE: '.lumpcode/lumps/backlog/prds/my-feature.prd.md',
                TEST_PLAN_FILE: '.lumpcode/lumps/backlog/testPlans/my-feature.test.md',
            },
        });
    });

    it('routes to testImpl when test plan exists and tests are toDo', async () => {
        await writeFile(path.join(lumpPath, 'prds', 'my-feature.prd.md'), '# PRD');
        await writeFile(path.join(lumpPath, 'testPlans', 'my-feature.test.md'), '# Plan');
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
                PRD_FILE: '.lumpcode/lumps/backlog/prds/my-feature.prd.md',
                TEST_PLAN_FILE: '.lumpcode/lumps/backlog/testPlans/my-feature.test.md',
            },
        });
    });

    it('ignores the item while test implementation is branchPushed', async () => {
        await writeFile(path.join(lumpPath, 'prds', 'my-feature.prd.md'), '# PRD');
        await writeFile(path.join(lumpPath, 'testPlans', 'my-feature.test.md'), '# Plan');
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
        await writeFile(path.join(lumpPath, 'prds', 'my-feature.prd.md'), '# PRD');
        await writeFile(path.join(lumpPath, 'testPlans', 'my-feature.test.md'), '# Plan');
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
                PRD_FILE: '.lumpcode/lumps/backlog/prds/my-feature.prd.md',
                TEST_PLAN_FILE: '.lumpcode/lumps/backlog/testPlans/my-feature.test.md',
            },
        });
    });
});

describe('featureBacklog parseItem reserved suffixes', () => {
    it('rejects item names ending in reserved suffixes via featureBacklog config', async () => {
        const projectRoot = await mkdtemp(path.join(tmpdir(), 'feature-backlog-config-'));
        const lumpPath = path.join(projectRoot, '.lumpcode', 'lumps', 'backlog');
        await mkdir(lumpPath, { recursive: true });
        const configPath = path.join(lumpPath, 'config.ts');
        await writeFile(configPath, 'export default {};\n');
        await writeFile(
            path.join(lumpPath, 'BACKLOG.yml'),
            `- name: bad_prd\n  task: x\n  priority: 1\n`,
        );
        await writeFile(path.join(lumpPath, 'DONE.yml'), '[]\n');

        const { featureBacklog } = await import('./main');
        const config = featureBacklog({
            configUrl: pathToFileURL(configPath),
            baseBranch: 'dev',
            implValidateCommand: 'npm test',
        });

        await expect(
            asGetContextListFn(config.getContextListFn)({ codeBasePaths: [], lumpVariables: {} }),
        ).rejects.toThrow(/reserved suffix _prd/);

        await rm(projectRoot, { recursive: true, force: true });
    });
});
