import fs from 'fs/promises';
import path from 'node:path';
import { dump as dumpYaml, load as loadYaml } from 'js-yaml';
import type { LumpVariables, StepVariables } from '@lumpcode/cli-utils';
import type { Step } from '@lumpcode/core';
import { pathExists } from '@lumpcode/core';

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Moves a finished backlog item folder from todo/ to the same relative path under completed/. */
export function folderSetTaskDoneStep<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
>(input: {
    itemsDirVarName: string;
    nameVarName?: string;
}): Step<V, SV> {
    const nameVarName = input.nameVarName ?? 'TASK_NAME';

    return {
        async commandFn({ context, workspacePath }) {
            const variables = context.variables as Record<string, string>;
            const itemsDirRelative = variables[input.itemsDirVarName];
            const taskName = variables[nameVarName];
            const itemDirRelative = variables.BACKLOG_ITEM_DIR;

            if (!itemsDirRelative || (!itemDirRelative && !taskName)) {
                throw new Error('Backlog items directory and task name are required');
            }

            const itemsDir = path.join(workspacePath, itemsDirRelative);
            const todoDir = path.join(itemsDir, 'todo');
            const fromDir = itemDirRelative
                ? path.join(workspacePath, itemDirRelative)
                : path.join(todoDir, taskName);
            const relativeFromTodo = path.relative(todoDir, fromDir);
            if (
                relativeFromTodo === '' ||
                relativeFromTodo.startsWith('..') ||
                path.isAbsolute(relativeFromTodo)
            ) {
                throw new Error(
                    `BACKLOG_ITEM_DIR must be a folder under ${todoDir}: ${itemDirRelative ?? fromDir}`,
                );
            }
            const toDir = path.join(itemsDir, 'completed', relativeFromTodo);
            const descPath = path.join(fromDir, 'desc.yml');
            const completedDescPath = path.join(toDir, 'desc.yml');

            if (!(await pathExists(fromDir))) {
                return null;
            }

            if (await pathExists(toDir)) {
                console.warn(
                    `[lumpcode/recipes] Cannot move backlog item "${taskName ?? relativeFromTodo}": already exists at ${toDir}`,
                );
                return null;
            }

            const rawText = await fs.readFile(descPath, 'utf-8');
            const raw = loadYaml(rawText);
            if (!isPlainObject(raw)) {
                throw new Error(`Backlog desc.yml at ${descPath} must contain a YAML object`);
            }

            const updated = {
                ...raw,
                completedAt: new Date().toISOString(),
            };
            await fs.mkdir(path.dirname(toDir), { recursive: true });
            await fs.rename(fromDir, toDir);
            await fs.writeFile(completedDescPath, dumpYaml(updated));

            return {
                executable: 'cat',
                args: [completedDescPath],
            };
        },
        continueOnError: true,
    };
}
