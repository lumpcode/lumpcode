import {
    normalizeSteps,
    type LumpJsConfig,
    type CommandFn,
    type LumpJsConfigSteps,
    type LumpVariables,
    type StepVariables,
} from '@lumpcode/cli-utils';
import type { CommandDescriptor, MaybePromise, PostCommandExecFn } from '@lumpcode/core';

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

export type GetRecursiveStepsOptions<
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
};

function stepIndexDepth(stepIndex: StepIndex): number {
    return Array.isArray(stepIndex) ? stepIndex.length : 1;
}

/** Agent prompt(s) followed by a validation command, retried until checks pass or `maxIterations` is reached. */
export function getRecursiveSteps<
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
}: GetRecursiveStepsOptions<V, SV>): LumpJsConfigSteps<V, SV> {
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
                if (stepIndexDepth(input.stepIndex) > maxIterations) {
                    return {
                        executable: 'echo',
                        args: ['Loop limit reached'],
                    };
                }
                const validateCommandDescriptor = await validationCommandFn({
                    ...input,
                    currentIteration,
                    prevValidateCommandResult,
                });
                thisIterValidateCommandDescriptor = validateCommandDescriptor || null;
                return validateCommandDescriptor;
            },
            async postCommandExecFn(input) {
                if (stepIndexDepth(input.stepIndex) > maxIterations) {
                    return;
                }
                if (isValidationCommandResultOk({
                    ...input,
                    currentIteration,
                })) {
                    return;
                }
                return getRecursiveSteps<V, SV>({
                    maxIterations,
                    validationCommandFn,
                    isValidationCommandResultOk,
                    getFirstSteps,
                    currentIteration: currentIteration + 1,
                    prevValidateCommandResult: input.commandResult,
                    prevValidateCommandDescriptor: thisIterValidateCommandDescriptor,
                });
            },
            continueOnError: currentIteration < maxIterations,
        },
    ];
}
