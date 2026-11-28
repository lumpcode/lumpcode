import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { Context } from '@lumpcode/core';

import { setTaskDone } from './setTaskDone';

// Skipped until the impl stage fills in the workflow helper. Unskip; do not rewrite.
describe('setTaskDone', () => {
    let workspacePath: string;
    const itemsDirRelative = 'backlogItems';

    afterEach(async () => {
        if (workspacePath) {
            await rm(workspacePath, { recursive: true, force: true });
        }
    });

    it('moves the item to completed and stamps completedAt', async () => {
        workspacePath = await mkdtemp(path.join(tmpdir(), 'set-task-done-'));
        const todoDir = path.join(workspacePath, itemsDirRelative, 'todo', 'alpha');
        await mkdir(todoDir, { recursive: true });
        await writeFile(
            path.join(todoDir, 'desc.yml'),
            'name: alpha\ntask: Alpha\npriority: 1\n',
        );

        const result = await setTaskDone({
            workspacePath,
            context: context({
                BACKLOG_ITEMS_DIR: itemsDirRelative,
                TASK_NAME: 'alpha',
                BACKLOG_ITEM_DIR: path.join(itemsDirRelative, 'todo', 'alpha'),
            }),
        });
        const completed = await readFile(
            path.join(workspacePath, itemsDirRelative, 'completed', 'alpha', 'desc.yml'),
            'utf-8',
        );

        expect(result).toMatchObject({ succeeded: true });
        expect(completed).toContain('completedAt:');
        await expect(access(todoDir)).rejects.toThrow();
    });

    it('throws when the context has no items directory', async () => {
        workspacePath = await mkdtemp(path.join(tmpdir(), 'set-task-done-missing-'));

        await expect(setTaskDone({
            workspacePath,
            context: context({}),
        })).rejects.toThrow(
            'setTaskDone: context "alpha" must set BACKLOG_ITEMS_DIR to the backlog items directory',
        );
    });
});

function context(variables: Record<string, string>): Context {
    return { name: 'alpha', variables };
}
