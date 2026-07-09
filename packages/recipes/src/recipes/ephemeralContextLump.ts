import { defineConfig, type LumpJsConfig, type LumpVariables } from '@lumpcode/cli-types';

import {
    ephemeralContextListFn,
    type ContextCountFn,
    type EphemeralContextListFnOptions,
} from '../kit/ephemeralContextListFn';
import {
    type GetFirstStepsInput,
    type IsValidationCommandResultOkInput,
} from '../kit/getRecursiveSteps';
import {
    verifyLoopPlugin,
    type VerifyLoopFixPromptInput,
    type VerifyLoopValidateCommand,
} from '../plugins/verifyLoopPlugin';
import { defineRecipe, type Recipe } from '../types/recipe';

export type EphemeralContextLumpFixPromptInput = VerifyLoopFixPromptInput;
export type EphemeralContextLumpValidateCommand = VerifyLoopValidateCommand;

export type EphemeralContextLumpOptions<V extends LumpVariables = LumpVariables> = Omit<
    LumpJsConfig<V>,
    'getContextListFn' | 'steps' | 'prompt' | 'contextListJson' | 'contextMatchFn' | 'numberOfContextsPerBranch'
> & {
    command: NonNullable<LumpJsConfig<V>['command']>;
    prompt: string | ((input: GetFirstStepsInput) => string);
    fixPrompt?: string | ((input: EphemeralContextLumpFixPromptInput) => string);
    validateCommand: EphemeralContextLumpValidateCommand;
    contextCount?: number | ContextCountFn;
    contextName?: EphemeralContextListFnOptions['contextName'];
    variables?: EphemeralContextListFnOptions['variables'];
    maxIterations?: number;
    isValidationCommandResultOk?: (input: IsValidationCommandResultOkInput) => boolean;
};

function resolveNumberOfContextsPerBranch(
    contextCount: number | ContextCountFn | undefined,
): number {
    if (typeof contextCount === 'number') {
        return contextCount;
    }

    if (typeof contextCount === 'function') {
        return Number.MAX_SAFE_INTEGER;
    }

    return 1;
}

function resolvePromptText(
    prompt: string | ((input: GetFirstStepsInput) => string),
    input: GetFirstStepsInput,
): string {
    return typeof prompt === 'function' ? prompt(input) : prompt;
}

/**
 * N ephemeral synthetic contexts per tick with a verify-until-green loop per context.
 * `numberOfContextsPerBranch` stays in sync with `contextCount` (or `maxContextCount` when dynamic).
 */
export const ephemeralContextLump: Recipe<EphemeralContextLumpOptions> = defineRecipe((options) => {
    const {
        command,
        prompt,
        fixPrompt,
        validateCommand,
        contextCount,
        contextName,
        variables,
        maxIterations = 5,
        isValidationCommandResultOk,
        maximumNumberOfConcurrentBranches = 1,
        ...rest
    } = options;

    const baseConfig = defineConfig({
        command,
        getContextListFn: ephemeralContextListFn({ contextCount, contextName, variables }),
        numberOfContextsPerBranch: resolveNumberOfContextsPerBranch(contextCount),
        maximumNumberOfConcurrentBranches,
        steps: [
            {
                promptFn() {
                    return resolvePromptText(prompt, {
                        currentIteration: 0,
                        prevValidateCommandResult: null,
                    });
                },
            },
        ],
        ...rest,
    });

    return verifyLoopPlugin(baseConfig, {
        validateCommand,
        fixSteps: fixPrompt,
        maxIterations,
        isValidationCommandResultOk,
    });
});
