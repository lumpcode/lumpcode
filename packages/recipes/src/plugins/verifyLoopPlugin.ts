import type { LumpJsConfigSteps } from '@lumpcode/cli-types';
import type { CommandDescriptor } from '@lumpcode/core';

import {
    getRecursiveSteps,
    type GetFirstStepsInput,
    type IsValidationCommandResultOkInput,
    type ValidationCommandFn,
    type ValidationCommandFnInput,
} from '../kit/getRecursiveSteps';
import { shellCommand } from '../kit/shellCommand';
import type { Plugin } from '../types/plugin';

export type VerifyLoopFixPromptInput = {
    currentIteration: number;
    prevValidateCommandResult: string | null;
};

export type VerifyLoopValidateCommand =
    | string
    | CommandDescriptor
    | ValidationCommandFn;

export type VerifyLoopFixSteps =
    | LumpJsConfigSteps
    | string
    | ((input: VerifyLoopFixPromptInput) => string);

export type VerifyLoopPluginOptions = {
    validateCommand: VerifyLoopValidateCommand;
    fixSteps?: VerifyLoopFixSteps;
    maxIterations?: number;
    isValidationCommandResultOk?: (input: IsValidationCommandResultOkInput) => boolean;
};

function resolveValidateCommand(
    validateCommand: VerifyLoopValidateCommand,
    input: ValidationCommandFnInput,
): ReturnType<ValidationCommandFn> {
    if (typeof validateCommand === 'function') {
        return validateCommand(input);
    }
    if (typeof validateCommand === 'string') {
        return shellCommand(validateCommand);
    }
    return validateCommand;
}

function defaultFixPrompt({ prevValidateCommandResult }: VerifyLoopFixPromptInput): string {
    return [
        'The verification step failed. Fix the issues and try again.',
        '',
        'Verification output:',
        '',
        prevValidateCommandResult ?? '(no output captured)',
    ].join('\n');
}

function resolveFixSteps(
    fixSteps: VerifyLoopFixSteps | undefined,
    input: VerifyLoopFixPromptInput,
): LumpJsConfigSteps {
    if (fixSteps === undefined) {
        return [
            {
                promptFn() {
                    return defaultFixPrompt(input);
                },
            },
        ];
    }

    if (typeof fixSteps === 'string') {
        return [
            {
                promptFn() {
                    return fixSteps;
                },
            },
        ];
    }

    if (typeof fixSteps === 'function') {
        return [
            {
                promptFn() {
                    return fixSteps(input);
                },
            },
        ];
    }

    return fixSteps;
}

/**
 * Wrap `config.steps` in a verify-until-green loop: iteration 0 runs the config steps,
 * later iterations run `fixSteps` (or a default fix prompt) until validation passes.
 */
export const verifyLoopPlugin: Plugin<VerifyLoopPluginOptions> = (config, options) => {
    if (!options) {
        throw new Error('verifyLoopPlugin requires options.');
    }

    const initialSteps = config.steps;
    if (!initialSteps?.length) {
        throw new Error('verifyLoopPlugin requires config.steps with at least one step.');
    }

    const {
        validateCommand,
        fixSteps,
        maxIterations = 5,
        isValidationCommandResultOk,
    } = options;

    return {
        ...config,
        steps: getRecursiveSteps({
            maxIterations,
            isValidationCommandResultOk,
            getFirstSteps({ currentIteration, prevValidateCommandResult }: GetFirstStepsInput) {
                if (currentIteration === 0) {
                    return initialSteps;
                }

                return resolveFixSteps(fixSteps, {
                    currentIteration,
                    prevValidateCommandResult,
                });
            },
            validationCommandFn(input) {
                return resolveValidateCommand(validateCommand, input);
            },
        }),
    };
};
