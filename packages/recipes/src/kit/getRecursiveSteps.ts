import type { Context, ContextRunState, LumpJsConfigSteps } from '@lumpcode/cli-types';
import type { CommandDescriptor, MaybePromise } from '@lumpcode/core';

const GET_RECURSIVE_STEPS_IS_OK_FLAG_KEY = '__getRecursiveSteps_isOk__';

export type StepIndex = number | number[];

export type ValidationCommandFnInput = {
    context: Context;
    contextRunState: ContextRunState;
    stepIndex: StepIndex;
    currentIteration: number;
    prevValidateCommandResult: string | null;
    contextRunStateIsOkFlagKey: string;
    projectRoot: string;
    workspacePath: string;
};

export type ValidationCommandFn = (
    input: ValidationCommandFnInput,
) => MaybePromise<CommandDescriptor | null | undefined>;

export type IsValidationCommandResultOkInput = {
    commandResult: string;
    commandSucceeded: boolean;
    contextRunState: ContextRunState;
    stepIndex: StepIndex;
    currentIteration: number;
};

export type GetFirstStepsInput = {
    currentIteration: number;
    prevValidateCommandResult: string | null;
};

export type GetRecursiveStepsOptions = {
    maxIterations?: number;
    validationCommandFn?: ValidationCommandFn;
    isValidationCommandResultOk?: (input: IsValidationCommandResultOkInput) => boolean;
    getFirstSteps?: (input: GetFirstStepsInput) => LumpJsConfigSteps;
    currentIteration?: number;
    prevValidateCommandResult?: string | null;
    contextRunStateIsOkFlagKey?: string;
};

function stepIndexDepth(stepIndex: StepIndex): number {
    return Array.isArray(stepIndex) ? stepIndex.length : 1;
}

/** Agent prompt(s) followed by a validation command, retried until checks pass or `maxIterations` is reached. */
export function getRecursiveSteps({
    maxIterations = 5,
    validationCommandFn = () => null,
    isValidationCommandResultOk = ({ commandSucceeded }) => commandSucceeded,
    getFirstSteps = () => [],
    currentIteration = 0,
    prevValidateCommandResult = null,
    contextRunStateIsOkFlagKey = GET_RECURSIVE_STEPS_IS_OK_FLAG_KEY,
}: GetRecursiveStepsOptions): LumpJsConfigSteps {
    const firstSteps = getFirstSteps({ currentIteration, prevValidateCommandResult });
    let thisIterValidateCommandResult: string | null = null;

    return [
        ...firstSteps,
        {
            commandFn({ context, contextRunState, stepIndex, projectRoot, workspacePath }) {
                if (stepIndexDepth(stepIndex) > maxIterations) {
                    return {
                        executable: 'echo',
                        args: ['Loop limit reached'],
                    };
                }
                if (!contextRunState[contextRunStateIsOkFlagKey]) {
                    return validationCommandFn({
                        context,
                        contextRunState,
                        stepIndex,
                        currentIteration,
                        prevValidateCommandResult,
                        contextRunStateIsOkFlagKey,
                        projectRoot,
                        workspacePath,
                    });
                }
                return null;
            },
            postCommandExecFn({ commandResult, contextRunState, commandSucceeded, stepIndex }) {
                thisIterValidateCommandResult = commandResult;
                contextRunState[contextRunStateIsOkFlagKey] = isValidationCommandResultOk({
                    commandResult,
                    commandSucceeded,
                    contextRunState,
                    stepIndex,
                    currentIteration,
                });
            },
            continueOnError: currentIteration < maxIterations,
        },
        ({ contextRunState, stepIndex }) => {
            if (stepIndexDepth(stepIndex) > maxIterations) {
                return [];
            }
            return !contextRunState[contextRunStateIsOkFlagKey]
                ? getRecursiveSteps({
                      maxIterations,
                      validationCommandFn,
                      isValidationCommandResultOk,
                      getFirstSteps,
                      currentIteration: currentIteration + 1,
                      prevValidateCommandResult: thisIterValidateCommandResult,
                      contextRunStateIsOkFlagKey,
                  })
                : [];
        },
    ];
}
