import fs from 'node:fs/promises';
import path from 'node:path';

import { defineConfig, readYamlList } from '@lumpcode/cli-utils';
import { projectRootFromConfigUrl } from '@lumpcode/recipes';

import {
    IDEAS_FILE,
    launchIdeasToBacklogCloudAgent,
    utcDateContextName,
} from './launchIdeasCloudAgent';

const MAX_BACKLOG_TODO_ITEMS = 3;
const BACKLOG_TODO_DIR = path.join(
    '.lumpcode',
    'lumps',
    'backlog',
    'backlogItems',
    'todo',
);

type IdeaEntry = {
    name?: unknown;
    task?: unknown;
    blocked?: unknown;
    /** Lower = more important; optional on IDEAS.yaml entries. */
    priority?: unknown;
};

function isUnblockedIdea(entry: IdeaEntry): boolean {
    if (typeof entry.name !== 'string' || entry.name.trim() === '') return false;
    if (typeof entry.task !== 'string' || entry.task.trim() === '') return false;
    if (typeof entry.blocked === 'string' && entry.blocked.trim() !== '') return false;
    return true;
}

const configUrl = import.meta.url;
const projectRoot = projectRootFromConfigUrl(configUrl);
const ideasPath = path.join(projectRoot, IDEAS_FILE);

async function backlogTodoCountExceedsLimit(): Promise<boolean> {
    const todoDir = path.join(projectRoot, BACKLOG_TODO_DIR);
    try {
        const entries = await fs.readdir(todoDir, { withFileTypes: true });
        const count = entries.filter((entry) => entry.isDirectory()).length;
        return count > MAX_BACKLOG_TODO_ITEMS;
    } catch {
        return false;
    }
}

export default defineConfig({
    discoveryBranch: 'dev',
    maximumNumberOfConcurrentBranches: 1,
    verbose: true,
    keepHistory: true,
    disabled: backlogTodoCountExceedsLimit,
    async getContextListFn() {
        const entries = await readYamlList<IdeaEntry>(ideasPath);
        if (!entries.some(isUnblockedIdea)) {
            return [];
        }
        const name = utcDateContextName();
        return [
            {
                name,
                variables: {
                    IDEAS_FILE,
                    CONTEXT_DATE: name,
                },
            },
        ];
    },
    steps: [
        {
            // No agent prompt in the lump worker — cloud agent is interactive.
            async commandFn({ context, workspacePath, projectRoot }) {
                const result = await launchIdeasToBacklogCloudAgent({
                    cwd: workspacePath,
                    projectRoot,
                    contextName: context.name,
                });
                if (!result.launched) {
                    console.log(`[ideasToBacklog] ${result.reason}`);
                } else {
                    console.log(
                        `[ideasToBacklog] Launched cloud agent on ${result.branchName} (continue in Cursor Agents)`,
                    );
                }
                return null;
            },
        },
    ],
});
