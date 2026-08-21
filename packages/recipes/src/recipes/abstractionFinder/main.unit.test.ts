import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { GetContextListFn } from '@lumpcode/cli-utils';
import { normalizeSteps } from '@lumpcode/cli-utils';

import { abstractionFinder, type AbstractionFinderOptions } from './main';

function asGetContextListFn(fn: unknown): GetContextListFn {
    if (typeof fn !== 'function') {
        throw new Error('Expected getContextListFn');
    }
    return fn as GetContextListFn;
}

async function writeTodoItem(backlogItemsDir: string, name: string) {
    await mkdir(path.join(backlogItemsDir, 'todo', name), { recursive: true });
}

describe('abstractionFinder', () => {
    let projectRoot: string;
    let configPath: string;
    let backlogItemsDir: string;

    beforeEach(async () => {
        projectRoot = await mkdtemp(path.join(tmpdir(), 'abstraction-finder-'));
        const lumpPath = path.join(projectRoot, '.lumpcode', 'lumps', 'abstractionFinder');
        await mkdir(lumpPath, { recursive: true });
        configPath = path.join(lumpPath, 'config.ts');
        await writeFile(configPath, 'export default {};\n');
        backlogItemsDir = '.lumpcode/lumps/abstractionImplementer/backlogItems';
    });

    afterEach(async () => {
        await rm(projectRoot, { recursive: true, force: true });
    });

    function makeConfig(extra: Partial<AbstractionFinderOptions> = {}) {
        return abstractionFinder({
            configUrl: pathToFileURL(configPath),
            backlogItemsDir,
            ...extra,
        });
    }

    it('rejects an absolute backlogItemsDir', () => {
        expect(() =>
            abstractionFinder({
                configUrl: pathToFileURL(configPath),
                backlogItemsDir: '/tmp/backlogItems',
            }),
        ).toThrow(/project-root-relative/);
    });

    it('emits one context when todo/ is empty, not maxPendingAbstractions contexts', async () => {
        const config = makeConfig({ maxPendingAbstractions: 5 });
        const contexts = await asGetContextListFn(config.getContextListFn)({
            codeBasePaths: [],
            lumpVariables: {},
            discoveryBranch: 'dev',
        });

        expect(contexts).toHaveLength(1);
        expect(contexts[0]?.variables.BACKLOG_ITEMS_DIR).toBe(backlogItemsDir);
    });

    it('emits one context while pending is under the cap', async () => {
        const itemsDir = path.join(projectRoot, backlogItemsDir);
        await writeTodoItem(itemsDir, 'already');

        const config = makeConfig({ maxPendingAbstractions: 2 });
        const contexts = await asGetContextListFn(config.getContextListFn)({
            codeBasePaths: [],
            lumpVariables: {},
            discoveryBranch: 'dev',
        });

        expect(contexts).toHaveLength(1);
    });

    it('emits no contexts when pending todo items are at the cap', async () => {
        const itemsDir = path.join(projectRoot, backlogItemsDir);
        await writeTodoItem(itemsDir, 'one');
        await writeTodoItem(itemsDir, 'two');

        const config = makeConfig({ maxPendingAbstractions: 2 });
        const contexts = await asGetContextListFn(config.getContextListFn)({
            codeBasePaths: [],
            lumpVariables: {},
            discoveryBranch: 'dev',
        });

        expect(contexts).toEqual([]);
    });

    it('uses scanDirectories in the default prompt instead of a hardcoded CLI path', () => {
        const config = makeConfig({ scanDirectories: ['src'] });
        const steps = normalizeSteps({
            prompt: undefined,
            jsSteps: config.steps,
        });

        expect(steps).toHaveLength(1);
        expect(steps[0]).toMatchObject({
            promptTemplate: expect.stringContaining('Scan @src'),
        });
        expect(JSON.stringify(steps[0])).not.toContain('packages/apps/cli');
        expect(JSON.stringify(steps[0])).toContain('@src/<utilName>/');
    });

    it('prepends scanCommand before the prompt', () => {
        const config = makeConfig({
            scanDirectories: ['src'],
            scanCommand: 'npx fallow dupes > .lumpcode/dupes.json',
        });
        const steps = normalizeSteps({
            prompt: undefined,
            jsSteps: config.steps,
        });

        expect(steps).toHaveLength(2);
        expect(steps[0]).toMatchObject({
            commandFn: expect.any(Function),
        });
        expect(steps[1]).toMatchObject({
            promptTemplate: expect.stringContaining('Scan @src'),
        });
    });

    it('uses caller steps after scanCommand', () => {
        const config = makeConfig({
            scanCommand: 'echo scanned',
            steps: [{ promptTemplate: 'Custom finder prompt' }],
        });
        const steps = normalizeSteps({
            prompt: undefined,
            jsSteps: config.steps,
        });

        expect(steps).toHaveLength(2);
        expect(steps[1]).toMatchObject({ promptTemplate: 'Custom finder prompt' });
    });
});
