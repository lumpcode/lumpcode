import {
    defineConfig,
    type CursorPresetLumpVariables,
    type CursorPresetStepVariables,
} from '@lumpcode/cli-utils';
import { openPrPostTeardown, projectRootFromConfigUrl } from '@lumpcode/recipes';

import { shouldRunBugHunter, utcDateContextName } from '../../helpers/workerQueue';

const projectRoot = projectRootFromConfigUrl(import.meta.url);

export default defineConfig<CursorPresetLumpVariables, CursorPresetStepVariables>({
    discoveryBranch: 'dev',
    command: 'cursor',
    registerCommands: ['cursor'],
    maximumNumberOfConcurrentBranches: 1,
    verbose: true,
    keepHistory: true,
    lumpVariables: { model: 'cursor-grok-4.6-high' },
    timeoutMillis: 1000 * 60 * 60 * 2,
    postTeardownWorkspaceFn: openPrPostTeardown({ provider: 'github' }),
    async getContextListFn() {
        if (!(await shouldRunBugHunter(projectRoot))) {
            return [];
        }
        const name = utcDateContextName();
        return [{ name, variables: { CONTEXT_DATE: name } }];
    },
    steps: [
        {
            promptFn({ context }) {
                const date = String(context.variables.CONTEXT_DATE);
                return `
Follow @.agents/skills/bug-hunter/SKILL.md
Context date: ${date}

File the bugs you can show. Do not fix them in this run.
                `.trim();
            },
        },
    ],
});
