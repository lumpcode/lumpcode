import type {
    LumpJsConfig,
    LumpJsConfigSteps,
    LumpVariables,
    StepVariables,
} from '@lumpcode/cli-utils';

import { defaultFixPromptText, formatVerificationCommand } from './defaultFixPrompt';
import {
    getValidationLoopSteps,
    type GetFirstStepsInput,
    type GetValidationLoopStepsOptions,
    type IsValidationCommandResultOkInput,
    type ValidationCommandFn,
} from './getValidationLoopSteps';

function defaultFixPrompt({ prevValidateCommandResult, prevValidateCommandDescriptor }: GetFirstStepsInput): string {
    return defaultFixPromptText(
        formatVerificationCommand(prevValidateCommandDescriptor),
        prevValidateCommandResult ?? '(no output captured)',
    );
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

export interface RetryUntilGreenStepsInput<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> {
    steps: LumpJsConfig<V, SV>['steps'];
    fixSteps?: (input: GetFirstStepsInput) => LumpJsConfig<V, SV>['steps'];
    validationCommandFn: ValidationCommandFn<V, SV>;
    isValidationCommandResultOk?: (input: IsValidationCommandResultOkInput<V, SV>) => boolean;
    maxIterations?: GetValidationLoopStepsOptions<V, SV>['maxIterations'];
    pushOnValidationFailure?: GetValidationLoopStepsOptions<V, SV>['pushOnValidationFailure'];
    validationFailedVariableName?: GetValidationLoopStepsOptions<V, SV>['validationFailedVariableName'];
}

/** Work steps, validation command, and optional fix steps — retried until checks pass or `maxIterations`. */
export function retryUntilGreenSteps<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
>({
    steps,
    fixSteps,
    validationCommandFn,
    isValidationCommandResultOk,
    maxIterations,
    pushOnValidationFailure,
    validationFailedVariableName,
}: RetryUntilGreenStepsInput<V, SV>): LumpJsConfigSteps<V, SV> {
    return getValidationLoopSteps<V, SV>({
        maxIterations,
        validationCommandFn,
        isValidationCommandResultOk,
        pushOnValidationFailure,
        validationFailedVariableName,
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
