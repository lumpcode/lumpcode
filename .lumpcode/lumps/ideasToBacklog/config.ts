import fs from 'node:fs/promises';
import path from 'node:path';

import { defineConfig, readYamlList } from '@lumpcode/cli-utils';
import { projectRootFromConfigUrl } from '@lumpcode/recipes';

import {
    IDEAS_FILE,
    launchIdeasToBacklogCloudAgent,
    utcDateContextName,
} from './launchIdeasCloudAgent';

const MAX_TODOS_PER_LANE = 3;
const BACKLOG_LANES = ['backlog', 'docs', 'qol', 'bugfixes'] as const;

function laneTodoDir(lane: (typeof BACKLOG_LANES)[number]): string {
    return path.join('.lumpcode', 'lumps', lane, 'backlogItems', 'todo');
}

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

async function countTodoDirs(todoDir: string): Promise<number> {
    try {
        const entries = await fs.readdir(todoDir, { withFileTypes: true });
        return entries.filter((entry) => entry.isDirectory()).length;
    } catch {
        return 0;
    }
}

async function allLanesOverTodoCap(): Promise<boolean> {
    const counts = await Promise.all(
        BACKLOG_LANES.map((lane) => countTodoDirs(path.join(projectRoot, laneTodoDir(lane)))),
    );
    return counts.every((count) => count > MAX_TODOS_PER_LANE);
}

export default defineConfig({
    discoveryBranch: 'dev',
    maximumNumberOfConcurrentBranches: 1,
    verbose: true,
    keepHistory: true,
    disabled: allLanesOverTodoCap,
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
