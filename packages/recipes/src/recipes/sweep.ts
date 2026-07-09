import {
    defineConfig,
    type ContextMatchFn,
    type FilePath,
    type LumpJsConfig,
    type LumpJsConfigSteps,
    type LumpVariables,
} from '@lumpcode/cli-types';
import type { CommandDescriptor } from '@lumpcode/core';

import { getRecursiveSteps, type ValidationCommandFn, type ValidationCommandFnInput } from '../kit/getRecursiveSteps';
import { shellCommand } from '../kit/shellCommand';
import { defineRecipe, type Recipe } from '../types/recipe';
import type { SoloTaskValidateCommand, SoloTaskFixPromptInput } from './soloTask';

export type SweepPrompt = string | ((input: { context: { name: string; variables: Record<string, string | number | boolean> } }) => string);

export type SweepOptions<V extends LumpVariables = LumpVariables> = {
    command: NonNullable<LumpJsConfig<V>['command']>;
    /** Static path template map (e.g. one README per package). */
    contextListJson?: FilePath | Record<string, string>;
    /** Dynamic discovery (e.g. codemod every matching file). */
    contextMatchFn?: FilePath | ContextMatchFn;
    /** Single prompt applied to each discovered context. Mutually exclusive with `steps`. */
    prompt?: SweepPrompt;
    /** Multi-step sweep (e.g. migration plan then port). Mutually exclusive with `prompt`. */
    steps?: LumpJsConfigSteps;
    /** When set with `prompt`, retry until this command succeeds. */
    validateCommand?: SoloTaskValidateCommand;
    fixPrompt?: string | ((input: SoloTaskFixPromptInput) => string);
    maxIterations?: number;
    numberOfContextsPerBranch?: number;
    maximumNumberOfConcurrentBranches?: number;
} & Omit<
    Partial<LumpJsConfig<V>>,
    | 'command'
    | 'getContextListFn'
    | 'steps'
    | 'prompt'
    | 'contextListJson'
    | 'contextMatchFn'
    | 'numberOfContextsPerBranch'
    | 'maximumNumberOfConcurrentBranches'
>;

function resolveValidateCommand(
    validateCommand: SoloTaskValidateCommand,
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

function defaultFixPrompt({ prevValidateCommandResult }: SoloTaskFixPromptInput): string {
    return [
        'The verification step failed. Fix the issues and try again.',
        '',
        'Verification output:',
        '',
        prevValidateCommandResult ?? '(no output captured)',
    ].join('\n');
}

function resolveFixPromptText(
    fixPrompt: string | ((input: SoloTaskFixPromptInput) => string) | undefined,
    input: SoloTaskFixPromptInput,
): string {
    const fix = fixPrompt ?? defaultFixPrompt;
    return typeof fix === 'function' ? fix(input) : fix;
}

function buildPromptSteps(options: SweepOptions): LumpJsConfigSteps {
    const { prompt, validateCommand, fixPrompt, maxIterations = 5 } = options;

    if (!prompt) {
        throw new Error('sweep: `prompt` is required when `steps` is not provided');
    }

    if (!validateCommand) {
        return [
            {
                promptFn({ context }) {
                    return typeof prompt === 'function' ? prompt({ context }) : prompt;
                },
            },
        ];
    }

    return getRecursiveSteps({
        maxIterations,
        getFirstSteps({ currentIteration, prevValidateCommandResult }) {
            return [
                {
                    promptFn({ context }) {
                        if (currentIteration === 0) {
                            return typeof prompt === 'function' ? prompt({ context }) : prompt;
                        }
                        return resolveFixPromptText(fixPrompt, {
                            currentIteration,
                            prevValidateCommandResult,
                        });
                    },
                },
            ];
        },
        validationCommandFn(input) {
            return resolveValidateCommand(validateCommand, input);
        },
    });
}

/**
 * Many similar contexts from a list template or file matcher — migrations, doc sweeps, codemods.
 */
export const sweep: Recipe<SweepOptions> = defineRecipe((options) => {
    const {
        command,
        contextListJson,
        contextMatchFn,
        prompt,
        steps,
        numberOfContextsPerBranch = 1,
        maximumNumberOfConcurrentBranches = 5,
        ...rest
    } = options;

    if (!contextListJson && !contextMatchFn) {
        throw new Error('sweep: provide `contextListJson` or `contextMatchFn`');
    }

    if (contextListJson && contextMatchFn) {
        throw new Error('sweep: `contextListJson` and `contextMatchFn` are mutually exclusive');
    }

    if (prompt && steps) {
        throw new Error('sweep: provide `prompt` or `steps`, not both');
    }

    if (!prompt && !steps) {
        throw new Error('sweep: provide `prompt` or `steps`');
    }

    const resolvedSteps = steps ?? buildPromptSteps(options);

    return defineConfig({
        command,
        contextListJson,
        contextMatchFn,
        numberOfContextsPerBranch,
        maximumNumberOfConcurrentBranches,
        steps: resolvedSteps,
        ...rest,
    });
});
