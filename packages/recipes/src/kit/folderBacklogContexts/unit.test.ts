import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { folderBacklogContexts } from './main';

async function writeTodoItem(
    backlogItemsDir: string,
    name: string,
    fields: Record<string, unknown>,
) {
    const itemDir = path.join(backlogItemsDir, 'todo', name);
    await mkdir(itemDir, { recursive: true });
    const lines = Object.entries({ name, ...fields }).map(([key, value]) => {
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

describe('folderBacklogContexts', () => {
    let backlogItemsDir: string;

    beforeEach(async () => {
        backlogItemsDir = await mkdtemp(path.join(tmpdir(), 'folder-backlog-'));
    });

    afterEach(async () => {
        await rm(backlogItemsDir, { recursive: true, force: true });
    });

    it('returns empty list when backlogItems/todo is missing', async () => {
        const getContextListFn = folderBacklogContexts({ backlogItemsDir });
        const contexts = await getContextListFn({ codeBasePaths: [], lumpVariables: {} });
        expect(contexts).toEqual([]);
    });

    it('discovers valid todo items and sorts by priority then name', async () => {
        await writeTodoItem(backlogItemsDir, 'beta', { task: 'Beta', priority: 2 });
        await writeTodoItem(backlogItemsDir, 'alpha', { task: 'Alpha', priority: 1 });
        await writeTodoItem(backlogItemsDir, 'gamma', { task: 'Gamma', priority: 2 });

        const getContextListFn = folderBacklogContexts({ backlogItemsDir });
        const contexts = await getContextListFn({ codeBasePaths: [], lumpVariables: {} });

        expect(contexts.map((ctx) => ctx.name)).toEqual(['alpha', 'beta', 'gamma']);
        expect(contexts[0]).toMatchObject({
            name: 'alpha',
            options: { priority: 1 },
        });
    });

    it('throws when desc.yml name does not match folder name', async () => {
        await writeTodoItem(backlogItemsDir, 'alpha', { task: 'Alpha', priority: 1, name: 'beta' });

        const getContextListFn = folderBacklogContexts({ backlogItemsDir });
        await expect(
            getContextListFn({ codeBasePaths: [], lumpVariables: {} }),
        ).rejects.toThrow(/must match folder name/);
    });

    it('throws when desc.yml is missing', async () => {
        await mkdir(path.join(backlogItemsDir, 'todo', 'alpha'), { recursive: true });

        const getContextListFn = folderBacklogContexts({ backlogItemsDir });
        await expect(
            getContextListFn({ codeBasePaths: [], lumpVariables: {} }),
        ).rejects.toThrow(/missing desc.yml/);
    });

    it('throws when desc.yml is not an object', async () => {
        const itemDir = path.join(backlogItemsDir, 'todo', 'alpha');
        await mkdir(itemDir, { recursive: true });
        await writeFile(path.join(itemDir, 'desc.yml'), '- name: alpha\n');

        const getContextListFn = folderBacklogContexts({ backlogItemsDir });
        await expect(
            getContextListFn({ codeBasePaths: [], lumpVariables: {} }),
        ).rejects.toThrow(/must be an object/);
    });

    it('supports parseItem and parseContext hooks', async () => {
        await writeTodoItem(backlogItemsDir, 'alpha', {
            task: 'Alpha',
            priority: 1,
            manualPrd: true,
        });

        const getContextListFn = folderBacklogContexts({
            backlogItemsDir,
            parseItem(baseItem, folderName, raw) {
                expect(folderName).toBe('alpha');
                expect(raw).toMatchObject({ manualPrd: true });
                return { ...baseItem, manualPrd: true };
            },
            async parseContext(item, folderName) {
                expect(folderName).toBe('alpha');
                expect(item.manualPrd).toBe(true);
                return {
                    parsed: {
                        variables: { FLAG: 'yes' },
                    },
                };
            },
        });

        const contexts = await getContextListFn({ codeBasePaths: [], lumpVariables: {} });
        expect(contexts[0]?.variables).toMatchObject({ FLAG: 'yes' });
    });

    it('drops ignored items from parseContext', async () => {
        await writeTodoItem(backlogItemsDir, 'alpha', { task: 'Alpha', priority: 1 });

        const getContextListFn = folderBacklogContexts({
            backlogItemsDir,
            parseContext() {
                return { ignored: true };
            },
        });

        const contexts = await getContextListFn({ codeBasePaths: [], lumpVariables: {} });
        expect(contexts).toEqual([]);
    });

    it('ignores non-directory entries in todo/', async () => {
        await mkdir(path.join(backlogItemsDir, 'todo'), { recursive: true });
        await writeFile(path.join(backlogItemsDir, 'todo', 'stray.txt'), 'noop\n');
        await writeTodoItem(backlogItemsDir, 'alpha', { task: 'Alpha', priority: 1 });

        const getContextListFn = folderBacklogContexts({ backlogItemsDir });
        const contexts = await getContextListFn({ codeBasePaths: [], lumpVariables: {} });
        expect(contexts).toHaveLength(1);
        expect(contexts[0]?.name).toBe('alpha');
    });
});
