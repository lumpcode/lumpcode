import type { LumpVariables, StepVariables } from '@lumpcode/cli-utils';
import type { CommandDescriptor } from '@lumpcode/core';

import type { ValidationCommandFn, ValidationCommandFnInput } from './getRecursiveSteps';
import { shellCommand } from './shellCommand';

export type ImplValidateCommand<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = string | CommandDescriptor | ValidationCommandFn<V, SV>;

export function resolveImplValidateCommand<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
>(
    implValidateCommand: ImplValidateCommand<V, SV>,
): ValidationCommandFn<V, SV> {
    if (typeof implValidateCommand === 'function') {
        return implValidateCommand;
    }
    if (typeof implValidateCommand === 'string') {
        return (_input: ValidationCommandFnInput<V, SV>) => shellCommand(implValidateCommand);
    }
    return (_input: ValidationCommandFnInput<V, SV>) => implValidateCommand;
}
