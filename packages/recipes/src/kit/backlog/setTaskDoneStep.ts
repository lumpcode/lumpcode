import fs from 'fs/promises';
import path from 'path';
import { dump as dumpYaml } from 'js-yaml';
import type { Step } from '@lumpcode/core';
import { readYamlList } from '@lumpcode/cli-utils';

import type { BacklogContextVariables, BaseBacklogItem, DoneBacklogItem } from './types';

/** Moves a finished backlog item from BACKLOG.yml to DONE.yml after the context completes. */
export const setTaskDoneStep: Step = {
    async commandFn({ context, workspacePath }) {
        const variables = context.variables as BacklogContextVariables;
        const { BACKLOG_FILE, DONE_FILE } = variables;

        const backlogFilePath = path.join(workspacePath, BACKLOG_FILE);
        const doneFilePath = path.join(workspacePath, DONE_FILE);

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
};
