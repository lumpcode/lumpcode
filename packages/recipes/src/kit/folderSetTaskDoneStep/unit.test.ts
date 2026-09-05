import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { folderSetTaskDoneStep } from './main';

async function writeTodoItem(
    itemsDir: string,
    name: string,
    fields: Record<string, unknown> = {},
) {
    const itemDir = path.join(itemsDir, 'todo', name);
    await mkdir(itemDir, { recursive: true });
    const body = {
        name,
        task: 'Task',
        priority: 1,
        ...fields,
    };
    const lines = Object.entries(body).map(([key, value]) => `${key}: ${value}`);
    await writeFile(path.join(itemDir, 'desc.yml'), `${lines.join('\n')}\n`);
}

describe('folderSetTaskDoneStep', () => {
    let workspacePath: string;
    let itemsDirRelative: string;

    beforeEach(async () => {
        workspacePath = await mkdtemp(path.join(tmpdir(), 'folder-set-done-'));
        itemsDirRelative = '.lumpcode/lumps/sample/backlogItems';
        await mkdir(path.join(workspacePath, itemsDirRelative, 'todo'), { recursive: true });
    });

    afterEach(async () => {
        await rm(workspacePath, { recursive: true, force: true });
    });

    it('moves todo item to completed and stamps completedAt', async () => {
        const itemsDir = path.join(workspacePath, itemsDirRelative);
        await writeTodoItem(itemsDir, 'alpha');

        const step = folderSetTaskDoneStep({ itemsDirVarName: 'BACKLOG_ITEMS_DIR' });
        const descriptor = await step.commandFn!({
            context: {
                name: 'alpha',
                variables: {
                    BACKLOG_ITEMS_DIR: itemsDirRelative,
                    TASK_NAME: 'alpha',
                },
            },
            workspacePath,
        } as never);

        expect(descriptor).toMatchObject({
            executable: 'cat',
            args: [path.join(itemsDir, 'completed', 'alpha', 'desc.yml')],
        });

        await expect(access(path.join(itemsDir, 'todo', 'alpha'))).rejects.toThrow();
        const completed = await readFile(path.join(itemsDir, 'completed', 'alpha', 'desc.yml'), 'utf-8');
        expect(completed).toContain('completedAt:');
    });

    it('no-ops when todo item is missing', async () => {
        const step = folderSetTaskDoneStep({ itemsDirVarName: 'BACKLOG_ITEMS_DIR' });
        await expect(
            step.commandFn!({
                context: {
                    name: 'missing',
                    variables: {
                        BACKLOG_ITEMS_DIR: itemsDirRelative,
                        TASK_NAME: 'missing',
                    },
                },
                workspacePath,
            } as never),
        ).resolves.toBeNull();
    });

    it('warns and skips rename when completed destination exists', async () => {
        const itemsDir = path.join(workspacePath, itemsDirRelative);
        await writeTodoItem(itemsDir, 'alpha');
        await mkdir(path.join(itemsDir, 'completed', 'alpha'), { recursive: true });
        await writeFile(
            path.join(itemsDir, 'completed', 'alpha', 'desc.yml'),
            'name: alpha\ncompletedAt: existing\n',
        );

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const step = folderSetTaskDoneStep({ itemsDirVarName: 'BACKLOG_ITEMS_DIR' });
        const result = await step.commandFn!({
            context: {
                name: 'alpha',
                variables: {
                    BACKLOG_ITEMS_DIR: itemsDirRelative,
                    TASK_NAME: 'alpha',
                },
            },
            workspacePath,
        } as never);

        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('already exists'));
        await expect(access(path.join(itemsDir, 'todo', 'alpha'))).resolves.toBeUndefined();
        warnSpy.mockRestore();
    });

    it('moves nested ticket folders using BACKLOG_ITEM_DIR', async () => {
        const itemsDir = path.join(workspacePath, itemsDirRelative);
        const ticketRelative = path.join(
            itemsDirRelative,
            'todo',
            'umbrella',
            'tickets',
            't1',
        );
        await writeTodoItem(itemsDir, path.join('umbrella', 'tickets', 't1'), { name: 't1' });

        const step = folderSetTaskDoneStep({ itemsDirVarName: 'BACKLOG_ITEMS_DIR' });
        const descriptor = await step.commandFn!({
            context: {
                name: 't1',
                variables: {
                    BACKLOG_ITEMS_DIR: itemsDirRelative,
                    TASK_NAME: 't1',
                    BACKLOG_ITEM_DIR: ticketRelative,
                },
            },
            workspacePath,
        } as never);

        expect(descriptor).toMatchObject({
            executable: 'cat',
            args: [
                path.join(itemsDir, 'completed', 'umbrella', 'tickets', 't1', 'desc.yml'),
            ],
        });

        await expect(
            access(path.join(itemsDir, 'todo', 'umbrella', 'tickets', 't1')),
        ).rejects.toThrow();
        const completed = await readFile(
            path.join(itemsDir, 'completed', 'umbrella', 'tickets', 't1', 'desc.yml'),
            'utf-8',
        );
        expect(completed).toContain('completedAt:');
    });

    it('merges umbrella parent into completed when tickets already exist there', async () => {
        const itemsDir = path.join(workspacePath, itemsDirRelative);
        const parentRelative = path.join(itemsDirRelative, 'todo', 'umbrella');
        await writeTodoItem(itemsDir, 'umbrella', { task: 'Parent feature' });
        await writeFile(
            path.join(itemsDir, 'todo', 'umbrella', 'requirements.md'),
            '# Requirements\n',
        );
        await mkdir(path.join(itemsDir, 'todo', 'umbrella', 'tickets'), { recursive: true });
        await mkdir(path.join(itemsDir, 'completed', 'umbrella', 'tickets', 't1'), {
            recursive: true,
        });
        await writeFile(
            path.join(itemsDir, 'completed', 'umbrella', 'tickets', 't1', 'desc.yml'),
            'name: t1\ntask: Done\npriority: 1\ncompletedAt: 2026-01-01T00:00:00.000Z\n',
        );

        const step = folderSetTaskDoneStep({ itemsDirVarName: 'BACKLOG_ITEMS_DIR' });
        const descriptor = await step.commandFn!({
            context: {
                name: 'umbrella',
                variables: {
                    BACKLOG_ITEMS_DIR: itemsDirRelative,
                    TASK_NAME: 'umbrella',
                    BACKLOG_ITEM_DIR: parentRelative,
                },
            },
            workspacePath,
        } as never);

        expect(descriptor).toMatchObject({
            executable: 'cat',
            args: [path.join(itemsDir, 'completed', 'umbrella', 'desc.yml')],
        });

        await expect(access(path.join(itemsDir, 'todo', 'umbrella'))).rejects.toThrow();
        const completedDesc = await readFile(
            path.join(itemsDir, 'completed', 'umbrella', 'desc.yml'),
            'utf-8',
        );
        expect(completedDesc).toContain('completedAt:');
        await expect(
            access(path.join(itemsDir, 'completed', 'umbrella', 'requirements.md')),
        ).resolves.toBeUndefined();
        await expect(
            access(path.join(itemsDir, 'completed', 'umbrella', 'tickets', 't1', 'desc.yml')),
        ).resolves.toBeUndefined();
    });

    it('sets continueOnError true', () => {
        const step = folderSetTaskDoneStep({ itemsDirVarName: 'BACKLOG_ITEMS_DIR' });
        expect(step.continueOnError).toBe(true);
    });
});
