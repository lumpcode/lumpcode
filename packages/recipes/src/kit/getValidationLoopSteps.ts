import {
    normalizeSteps,
    type LumpJsConfig,
    type CommandFn,
    type LumpJsConfigSteps,
    type LumpVariables,
    type StepVariables,
} from '@lumpcode/cli-utils';
import type { CommandDescriptor, MaybePromise, PostCommandExecFn } from '@lumpcode/core';

import { shellCommand } from './shellCommand';

export type StepIndex = number | number[];

export type ValidationCommandFnInput<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = Parameters<CommandFn<V, SV>>[0] & {
    currentIteration: number;
    prevValidateCommandResult: string | null;
};

export type ValidationCommandFn<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = (
    input: ValidationCommandFnInput<V, SV>,
) => MaybePromise<CommandDescriptor | null | undefined>;

export type IsValidationCommandResultOkInput<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = Parameters<PostCommandExecFn<V, SV>>[0] & {
    currentIteration: number;
};

export type GetFirstStepsInput = {
    currentIteration: number;
    prevValidateCommandResult: string | null;
    prevValidateCommandDescriptor: CommandDescriptor | null;
};

export type GetValidationLoopStepsOptions<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = {
    maxIterations?: number;
    validationCommandFn?: ValidationCommandFn<V, SV>;
    isValidationCommandResultOk?: (input: IsValidationCommandResultOkInput<V, SV>) => boolean;
    getFirstSteps?: (input: GetFirstStepsInput) => LumpJsConfig<V, SV>['steps'];
    currentIteration?: number;
    prevValidateCommandResult?: string | null;
    prevValidateCommandDescriptor?: CommandDescriptor | null;
    /** When the last check is still red, succeed and let core push. `false` fails the walk after the flag is set. Default `true`. */
    pushOnValidationFailure?: boolean;
    /** Lump variable set to `true` when the last check is still red, `false` when a check passes. Default `__VALIDATION_FAILED__`. */
    validationFailedVariableName?: string;
};

export const DEFAULT_VALIDATION_FAILED_VARIABLE_NAME = '__VALIDATION_FAILED__';

function setValidationFailed({
    lumpVariables,
    variableName,
    failed,
}: {
    lumpVariables: LumpVariables;
    variableName: string;
    failed: boolean;
}): void {
    lumpVariables[variableName] = failed;
}

/** Fails the walk after the validation-failed variable is already set. The check keeps `continueOnError: true` so core still runs `postCommandExecFn`. */
function withholdPushAfterValidationFailure<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
>(): LumpJsConfigSteps<V, SV> {
    return [
        {
            commandFn: () => shellCommand('exit 1'),
            continueOnError: false,
        },
    ];
}

/** Agent prompt(s) followed by a validation command, retried until checks pass or `maxIterations` is reached. */
export function getValidationLoopSteps<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
>({
    maxIterations = 5,
    validationCommandFn = () => null,
    isValidationCommandResultOk = ({ commandSucceeded }) => commandSucceeded,
    getFirstSteps = () => [],
    currentIteration = 0,
    prevValidateCommandResult = null,
    prevValidateCommandDescriptor = null,
    pushOnValidationFailure = true,
    validationFailedVariableName = DEFAULT_VALIDATION_FAILED_VARIABLE_NAME,
}: GetValidationLoopStepsOptions<V, SV>): LumpJsConfigSteps<V, SV> {
    const firstSteps = getFirstSteps({
        currentIteration,
        prevValidateCommandResult,
        prevValidateCommandDescriptor,
    });

    let thisIterValidateCommandDescriptor: CommandDescriptor | null = null;

    return [
        ...normalizeSteps<V, SV>({
            prompt: undefined,
            jsSteps: firstSteps,
        }),
        {
            async commandFn(input) {
                const validateCommandDescriptor = await validationCommandFn({
                    ...input,
                    currentIteration,
                    prevValidateCommandResult,
                });
                thisIterValidateCommandDescriptor = validateCommandDescriptor || null;
                return validateCommandDescriptor;
            },
            async postCommandExecFn(input) {
                if (isValidationCommandResultOk({
                    ...input,
                    currentIteration,
                })) {
                    setValidationFailed({
                        lumpVariables: input.lumpVariables,
                        variableName: validationFailedVariableName,
                        failed: false,
                    });
                    return;
                }
                if (currentIteration < maxIterations) {
                    return getValidationLoopSteps<V, SV>({
                        maxIterations,
                        validationCommandFn,
                        isValidationCommandResultOk,
                        getFirstSteps,
                        currentIteration: currentIteration + 1,
                        prevValidateCommandResult: input.commandResult,
                        prevValidateCommandDescriptor: thisIterValidateCommandDescriptor,
                        pushOnValidationFailure,
                        validationFailedVariableName,
                    });
                }
                setValidationFailed({
                    lumpVariables: input.lumpVariables,
                    variableName: validationFailedVariableName,
                    failed: true,
                });
                if (pushOnValidationFailure) {
                    return;
                }
                return withholdPushAfterValidationFailure<V, SV>();
            },
            // Always reach postCommandExecFn, including a red last check, so the flag is set before any withholding step.
            continueOnError: true,
        },
    ];
}

/** @deprecated Use `getValidationLoopSteps`. */
export const getRecursiveSteps = getValidationLoopSteps;

/** @deprecated Use `GetValidationLoopStepsOptions`. */
export type GetRecursiveStepsOptions<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = GetValidationLoopStepsOptions<V, SV>;
