import type {
    LumpJsConfig,
    LumpJsConfigSteps,
    LumpVariables,
    StepVariables,
} from '@lumpcode/cli-utils';
import type { CommandDescriptor } from '@lumpcode/core';
import { shellSingleQuote } from '@lumpcode/core';

import {
    getRecursiveSteps,
    type GetFirstStepsInput,
    type GetRecursiveStepsOptions,
    type IsValidationCommandResultOkInput,
    type ValidationCommandFn,
} from './getRecursiveSteps';

function formatVerificationCommand(descriptor: CommandDescriptor | null): string {
    if (!descriptor) {
        return '(no verification command recorded)';
    }

    if (descriptor.executable === 'sh' && descriptor.args[0] === '-c' && descriptor.args.length === 2) {
        return descriptor.args[1];
    }

    const command = [descriptor.executable, ...descriptor.args.map(shellSingleQuote)].join(' ');
    if (!descriptor.env || Object.keys(descriptor.env).length === 0) {
        return command;
    }

    const envPrefix = Object.entries(descriptor.env)
        .map(([key, value]) => `${key}=${shellSingleQuote(value)}`)
        .join(' ');
    return `${envPrefix} ${command}`;
}

function defaultFixPrompt({ prevValidateCommandResult, prevValidateCommandDescriptor }: GetFirstStepsInput): string {
    return [
        'The verification step failed. Fix the issues and try again.',
        '',
        'Verification command:',
        '',
        formatVerificationCommand(prevValidateCommandDescriptor),
        '',
        'Verification output:',
        '',
        prevValidateCommandResult ?? '(no output captured)',
    ].join('\n');
}

function defaultFixSteps<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
>(input: GetFirstStepsInput): LumpJsConfig<V, SV>['steps'] {
    return [
        {
            promptFn() {
                return defaultFixPrompt(input);
            },
        },
    ];
}

export interface RetryUntilGreenInput<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> {
    steps: LumpJsConfig<V, SV>['steps'];
    fixSteps?: (input: GetFirstStepsInput) => LumpJsConfig<V, SV>['steps'];
    validationCommandFn: ValidationCommandFn<V, SV>;
    isValidationCommandResultOk?: (input: IsValidationCommandResultOkInput<V, SV>) => boolean;
    maxIterations?: GetRecursiveStepsOptions<V, SV>['maxIterations'];
}

/** Work steps, validation command, and optional fix steps — retried until checks pass or `maxIterations`. */
export function retryUntilGreen<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
>({
    steps,
    fixSteps,
    validationCommandFn,
    isValidationCommandResultOk,
    maxIterations,
}: RetryUntilGreenInput<V, SV>): LumpJsConfigSteps<V, SV> {
    return getRecursiveSteps<V, SV>({
        maxIterations,
        validationCommandFn,
        isValidationCommandResultOk,
        getFirstSteps({ currentIteration, prevValidateCommandResult, prevValidateCommandDescriptor }) {
            if (currentIteration === 0) {
                return steps;
            }

            return (fixSteps ?? defaultFixSteps<V, SV>)({
                currentIteration,
                prevValidateCommandResult,
                prevValidateCommandDescriptor,
            });
        },
    });
}
