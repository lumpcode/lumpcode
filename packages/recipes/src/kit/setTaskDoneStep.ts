import fs from 'fs/promises';
import path from 'path';
import { dump as dumpYaml } from 'js-yaml';
import type { Step } from '@lumpcode/core';
import { readYamlList } from '@lumpcode/cli-utils';

import type { BaseBacklogItem, DoneBacklogItem } from '../types';

let setTaskDoneDeprecatedWarned = false;

function warnSetTaskDoneDeprecated(): void {
    if (setTaskDoneDeprecatedWarned) {
        return;
    }
    setTaskDoneDeprecatedWarned = true;
    console.warn(
        '[lumpcode/recipes] setTaskDoneStep is deprecated; use folderSetTaskDoneStep. ' +
            'YAML backlog helpers will be removed in a future major version.',
    );
}

/** Moves a finished backlog item from BACKLOG.yml to DONE.yml after the context completes. */
export const setTaskDoneStep = (input: {
    backlogVarName: string;
    doneVarName: string;
}): Step => {
    return {    
        async commandFn({ context, workspacePath }) {
            warnSetTaskDoneDeprecated();
            const variables = context.variables as Record<string, string>;
            const { backlogVarName, doneVarName } = input;

            const baseBacklogFilePath = variables[backlogVarName];
            const baseDoneFilePath = variables[doneVarName];

            if (!baseBacklogFilePath || !baseDoneFilePath) {
                throw new Error(`Backlog and done file paths are required`);
            }

            const backlogFilePath = path.join(workspacePath, baseBacklogFilePath);
            const doneFilePath = path.join(workspacePath, baseDoneFilePath);

            const backlog = await readYamlList<BaseBacklogItem>(backlogFilePath);
            const finishedItem = backlog.find((item) => item.name === variables.TASK_NAME);

            if (finishedItem) {
                const remaining = backlog.filter((item) => item.name !== variables.TASK_NAME);
                await fs.writeFile(backlogFilePath, dumpYaml(remaining));

                const done = await readYamlList<DoneBacklogItem<BaseBacklogItem>>(doneFilePath);
                done.push({ ...finishedItem, completedAt: new Date().toISOString() });
                await fs.writeFile(doneFilePath, dumpYaml(done));
            }

            return {
                executable: 'cat',
                args: [doneFilePath],
            };
        },
        continueOnError: true,
    }
};
