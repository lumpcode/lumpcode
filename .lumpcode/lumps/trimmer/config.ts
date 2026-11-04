import {
    defineConfig,
    type CursorPresetLumpVariables,
    type CursorPresetStepVariables,
} from '@lumpcode/cli-utils';
import {
    ephemeralContextListFn,
    openPrPostTeardown,
    retryUntilGreen,
    shellCommand,
} from '@lumpcode/recipes';

import { explanationPrBody } from '../../helpers/explanationPrBody';

const EXPLANATION = '.lumpcode/lumps/trimmer/explanation.md';

export default defineConfig<CursorPresetLumpVariables, CursorPresetStepVariables>({
    discoveryBranch: 'dev',
    command: 'cursor',
    registerCommands: ['cursor'],
    maximumNumberOfConcurrentBranches: 1,
    verbose: true,
    keepHistory: true,
    lumpVariables: { model: 'claude-opus-5-5' },
    timeoutMillis: 1000 * 60 * 60 * 2,
    getContextListFn: ephemeralContextListFn({
        variables: { EXPLANATION },
    }),
    postTeardownWorkspaceFn: openPrPostTeardown({
        provider: 'github',
        body: explanationPrBody(EXPLANATION),
    }),
    steps: retryUntilGreen({
        maxIterations: 2,
        steps: [
            {
                promptFn({ context }) {
                    const explanation = String(context.variables.EXPLANATION);
                    return `
Follow @.agents/skills/trimmer/SKILL.md
Write the review note to @${explanation} and make the one removal it describes.
                    `.trim();
                },
            },
        ],
        fixSteps(input) {
            return [
                {
                    promptFn() {
                        return `
The verification step failed. Stay inside @.agents/skills/trimmer/SKILL.md and fix the failure without widening the change.

Verification output:

${input.prevValidateCommandResult ?? '(no output)'}
                        `.trim();
                    },
                },
            ];
        },
        validationCommandFn: () => shellCommand(`test -f ${EXPLANATION} && npm run build`),
    }),
});
