import {
    defineConfig,
    type CursorPresetLumpVariables,
    type CursorPresetStepVariables,
} from '@lumpcode/cli-utils';
import {
    openPrPostTeardown,
    projectRootFromConfigUrl,
    shellCommand,
} from '@lumpcode/recipes';

import { retryUntilGreenSteps } from '../../helpers/recipesBridge';
import { shouldRunAutoTriage, utcDateContextName } from '../../helpers/workerQueue';

const projectRoot = projectRootFromConfigUrl(import.meta.url);

export default defineConfig<CursorPresetLumpVariables, CursorPresetStepVariables>({
    discoveryBranch: 'dev',
    command: 'cursor',
    registerCommands: ['cursor'],
    maximumNumberOfConcurrentBranches: 1,
    verbose: true,
    keepHistory: true,
    lumpVariables: { model: 'claude-opus-5-5-high' },
    timeoutMillis: 1000 * 60 * 60 * 2,
    postTeardownWorkspaceFn: openPrPostTeardown({ provider: 'github' }),
    async getContextListFn() {
        if (!(await shouldRunAutoTriage(projectRoot))) {
            return [];
        }
        const name = utcDateContextName();
        return [
            {
                name,
                variables: {
                    CONTEXT_DATE: name,
                    IDEAS_FILE: 'IDEAS.yaml',
                },
            },
        ];
    },
    steps: retryUntilGreenSteps({
        maxIterations: 2,
        pushOnValidationFailure: false,
        steps: [
            {
                promptFn({ context }) {
                    const date = String(context.variables.CONTEXT_DATE);
                    const ideasFile = String(context.variables.IDEAS_FILE);
                    return `
Follow @.agents/skills/auto-triage/SKILL.md
Context date: ${date}
Ideas file: @${ideasFile}

Decide on your own. Do not ask the operator. File the items, then stop.
Leave every todo whose workflow contains manualReq untouched.
                    `.trim();
                },
            },
        ],
        validationCommandFn: () => shellCommand('node .lumpcode/helpers/manualReqTodo.mjs'),
    }),
});
