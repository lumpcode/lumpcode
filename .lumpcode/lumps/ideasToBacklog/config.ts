import path from 'node:path';

import { defineConfig, readYamlList } from '@lumpcode/cli-utils';
import { projectRootFromConfigUrl } from '@lumpcode/recipes';

import {
    IDEAS_FILE,
    launchIdeasToBacklogCloudAgent,
    utcDateContextName,
} from './launchIdeasCloudAgent';

type IdeaEntry = {
    name?: unknown;
    task?: unknown;
    blocked?: unknown;
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

export default defineConfig({
    discoveryBranch: 'dev',
    maximumNumberOfConcurrentBranches: 1,
    verbose: true,
    keepHistory: true,
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
