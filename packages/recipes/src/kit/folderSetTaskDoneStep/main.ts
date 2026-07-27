import fs from 'fs/promises';
import path from 'node:path';
import { dump as dumpYaml, load as loadYaml } from 'js-yaml';
import type { LumpVariables, StepVariables } from '@lumpcode/cli-utils';
import type { Step } from '@lumpcode/core';
import { pathExists } from '@lumpcode/core';

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Moves a finished backlog item folder from todo/ to completed/ after the context completes. */
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

            if (!itemsDirRelative || !taskName) {
                throw new Error('Backlog items directory and task name are required');
            }

            const itemsDir = path.join(workspacePath, itemsDirRelative);
            const fromDir = path.join(itemsDir, 'todo', taskName);
            const toDir = path.join(itemsDir, 'completed', taskName);
            const descPath = path.join(fromDir, 'desc.yml');
            const completedDescPath = path.join(toDir, 'desc.yml');

            if (!(await pathExists(fromDir))) {
                return null;
            }

            if (await pathExists(toDir)) {
                console.warn(
                    `[lumpcode/recipes] Cannot move backlog item "${taskName}": already exists at ${toDir}`,
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
            await fs.mkdir(path.join(itemsDir, 'completed'), { recursive: true });
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
