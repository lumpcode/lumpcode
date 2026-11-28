import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GetContextListFn } from '@lumpcode/cli-utils';
import { getContextStatus } from '@lumpcode/cli-utils';

import { featureBacklogSteps } from './main';
import { featureBacklog } from './workflowRecipe';

vi.mock('@lumpcode/cli-utils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@lumpcode/cli-utils')>();
    return {
        ...actual,
        getContextStatus: vi.fn(),
    };
});

// Skipped until the impl stage reads `stages`. Unskip; do not rewrite.
describe('featureBacklog stages', () => {
    let projectRoot: string;
    const roots: string[] = [];

    afterEach(async () => {
        await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
    });

    it('uses stages and sets STAGES and WORKFLOW to the same canonical list', async () => {
        const { configUrl } = await writeItem(
            'name: alpha\ntask: Alpha\npriority: 1\nstages:\n  - impl\n  - req\n',
        );
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const config = featureBacklog({ configUrl });

        const contexts = await list(config, 'dev');

        expect(contexts.map((ctx) => ctx.name)).toEqual(['alpha_req']);
        expect(contexts[0]?.variables.STAGES).toBe('req,impl');
        expect(contexts[0]?.variables.WORKFLOW).toBe('req,impl');
        expect(warnSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it('accepts workflow as a deprecated alias and warns once per item per list', async () => {
        const { configUrl } = await writeItem(
            'name: alpha\ntask: Alpha\npriority: 1\nworkflow:\n  - req\n  - impl\n',
            'beta',
            'name: beta\ntask: Beta\npriority: 2\nworkflow:\n  - directImpl\n',
        );
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const config = featureBacklog({ configUrl });
        const listContexts = () => list(config, 'dev');

        await listContexts();
        const first = warnSpy.mock.calls.map((call) => String(call[0]));
        warnSpy.mockClear();
        await listContexts();
        const second = warnSpy.mock.calls.map((call) => String(call[0]));

        const deprecated = [
            'alpha: "workflow" is deprecated in desc.yml; rename it to "stages".',
            'beta: "workflow" is deprecated in desc.yml; rename it to "stages".',
        ];
        expect(first.sort()).toEqual(deprecated);
        expect(second.sort()).toEqual(deprecated);
        warnSpy.mockRestore();
    });

    it('fails when stages and workflow are both set', async () => {
        const { configUrl } = await writeItem(
            'name: alpha\ntask: Alpha\npriority: 1\nstages:\n  - req\nworkflow:\n  - req\n',
        );
        const config = featureBacklog({ configUrl });

        await expect(list(config, 'dev')).rejects.toThrow(
            'alpha: use "stages" only ("workflow" is its deprecated name).',
        );
    });

    it('names the field that failed validation', async () => {
        const stagesConfig = featureBacklog({
            configUrl: (await writeItem(
                'name: alpha\ntask: Alpha\npriority: 1\nstages: nope\n',
            )).configUrl,
        });
        await expect(list(stagesConfig, 'dev')).rejects.toThrow(
            'Backlog item "alpha" field "stages" must be an array of stages',
        );

        const duplicateConfig = featureBacklog({
            configUrl: (await writeItem(
                'name: alpha\ntask: Alpha\npriority: 1\nstages:\n  - req\n  - req\n',
            )).configUrl,
        });
        await expect(list(duplicateConfig, 'dev')).rejects.toThrow(
            'Backlog item "alpha" field "stages" must not contain duplicate stages',
        );

        const aliasConfig = featureBacklog({
            configUrl: (await writeItem(
                'name: alpha\ntask: Alpha\npriority: 1\nworkflow:\n  - nope\n',
            )).configUrl,
        });
        await expect(list(aliasConfig, 'dev')).rejects.toThrow(
            'Backlog item "alpha" field "workflow" contains unknown stage "nope"',
        );
    });

    it('keeps the default stage list when stages and workflow are omitted', async () => {
        const { configUrl } = await writeItem('name: alpha\ntask: Alpha\npriority: 1\n');
        await writeFile(
            path.join(projectRoot, '.lumpcode/lumps/ship/backlogItems/todo/alpha/requirements.md'),
            '# Requirements\n',
        );
        vi.mocked(getContextStatus).mockResolvedValue('toDo');
        const config = featureBacklog({ configUrl });

        const contexts = await list(config, 'feature/alpha');

        expect(contexts[0]?.name).toBe('alpha_testImpl');
        expect(contexts[0]?.variables.STAGES).toBe('manualReq,testImpl,impl');
        expect(contexts[0]?.variables.WORKFLOW).toBe('manualReq,testImpl,impl');
    });

    it('lists the same context names as featureBacklogSteps for the same stages', async () => {
        const workflowFixture = await writeItem(
            'name: alpha\ntask: Alpha\npriority: 1\nstages:\n  - req\n  - impl\n',
        );
        const stepsRoot = await mkdtemp(path.join(tmpdir(), 'feature-backlog-steps-same-'));
        const stepsLump = path.join(stepsRoot, '.lumpcode', 'lumps', 'ship');
        await mkdir(path.join(stepsLump, 'backlogItems', 'todo', 'alpha'), { recursive: true });
        const stepsConfigPath = path.join(stepsLump, 'config.ts');
        await writeFile(stepsConfigPath, 'export default {};\n');
        await writeFile(
            path.join(stepsLump, 'backlogItems', 'todo', 'alpha', 'desc.yml'),
            'name: alpha\ntask: Alpha\npriority: 1\nworkflow:\n  - req\n  - impl\n',
        );

        const workflowContexts = await list(featureBacklog({ configUrl: workflowFixture.configUrl }), 'dev');
        const stepsContexts = await list(featureBacklogSteps({ configUrl: pathToFileURL(stepsConfigPath) }), 'dev');

        expect(workflowContexts.map((ctx) => ctx.name)).toEqual(stepsContexts.map((ctx) => ctx.name));
        expect(workflowContexts.map((ctx) => ctx.variables.BACKLOG_STAGE)).toEqual(
            stepsContexts.map((ctx) => ctx.variables.BACKLOG_STAGE),
        );
        for (const ctx of workflowContexts) {
            expect(ctx.variables.STAGES).toBe(ctx.variables.WORKFLOW);
            expect(ctx.variables.WORKFLOW).toBe(
                stepsContexts.find((stepsCtx) => stepsCtx.name === ctx.name)?.variables.WORKFLOW,
            );
        }

        await rm(stepsRoot, { recursive: true, force: true });
    });

    async function writeItem(alphaBody: string, secondName?: string, secondBody?: string) {
        projectRoot = await mkdtemp(path.join(tmpdir(), 'feature-backlog-stages-'));
        roots.push(projectRoot);
        const lumpPath = path.join(projectRoot, '.lumpcode', 'lumps', 'ship');
        await mkdir(path.join(lumpPath, 'backlogItems', 'todo', 'alpha'), { recursive: true });
        const configPath = path.join(lumpPath, 'config.ts');
        await writeFile(configPath, 'export default {};\n');
        await writeFile(path.join(lumpPath, 'backlogItems', 'todo', 'alpha', 'desc.yml'), alphaBody);
        if (secondName && secondBody) {
            await mkdir(path.join(lumpPath, 'backlogItems', 'todo', secondName), { recursive: true });
            await writeFile(
                path.join(lumpPath, 'backlogItems', 'todo', secondName, 'desc.yml'),
                secondBody,
            );
        }
        return { configUrl: pathToFileURL(configPath) };
    }
});

function list(
    config: { getContextListFn?: unknown },
    discoveryBranch: string,
) {
    return asGetContextListFn(config.getContextListFn)({
        codeBasePaths: [],
        lumpVariables: {},
        discoveryBranch,
    });
}

function asGetContextListFn(fn: unknown): GetContextListFn {
    if (typeof fn !== 'function') {
        throw new Error('Expected getContextListFn');
    }
    return fn as GetContextListFn;
}
