import type { CommandDescriptor } from '@lumpcode/core';

import type { ValidationCommandFn, ValidationCommandFnInput } from './getRecursiveSteps';
import { shellCommand } from './shellCommand';

export type ImplValidateCommand = string | CommandDescriptor | ValidationCommandFn;

export function resolveImplValidateCommand(
    implValidateCommand: ImplValidateCommand,
): ValidationCommandFn {
    if (typeof implValidateCommand === 'function') {
        return implValidateCommand;
    }
    if (typeof implValidateCommand === 'string') {
        return (_input: ValidationCommandFnInput) => shellCommand(implValidateCommand);
    }
    return (_input: ValidationCommandFnInput) => implValidateCommand;
}
