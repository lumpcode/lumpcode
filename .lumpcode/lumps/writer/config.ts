import {
    defineConfig,
    type CursorPresetLumpVariables,
    type CursorPresetStepVariables,
} from '@lumpcode/cli-utils';
import {
    ephemeralContextListFn,
    openPrPostTeardown,
    retryUntilGreenSteps,
    shellCommand,
} from '@lumpcode/recipes';

import { explanationPrBody } from '../../helpers/explanationPrBody';

const EXPLANATION = '.lumpcode/lumps/writer/explanation.md';

export default defineConfig<CursorPresetLumpVariables, CursorPresetStepVariables>({
    discoveryBranch: 'dev',
    command: 'cursor',
    registerCommands: ['cursor'],
    maximumNumberOfConcurrentBranches: 1,
    verbose: true,
    keepHistory: true,
    lumpVariables: { model: 'grok-4.7-xhigh' },
    timeoutMillis: 1000 * 60 * 60 * 2,
    disabled: true,
    getContextListFn: ephemeralContextListFn({
        variables: { EXPLANATION },
    }),
    postTeardownWorkspaceFn: openPrPostTeardown({
        provider: 'github',
        body: explanationPrBody(EXPLANATION),
    }),
    steps: retryUntilGreenSteps({
        maxIterations: 2,
        steps: [
            {
                promptFn({ context }) {
                    const explanation = String(context.variables.EXPLANATION);
                    return `
Follow @.agents/skills/writer/SKILL.md
Read @.agents/memory/writing/docs.md and @.agents/memory/writing/website.md before you edit.
Write the review note to @${explanation} and make the one wording change it describes.`.trim();
                },
            },
        ],
        validationCommandFn: () => shellCommand(`test -f ${EXPLANATION}`),
    }),
});
