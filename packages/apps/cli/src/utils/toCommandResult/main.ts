import type { Failure, Success } from '@lumpcode/core';

import type { CommandOutput } from '../../types';
import { commandFailure } from '../commandFailure';

export function toCommandResult<T>(
    result: Success<T> | Failure<string>,
): Success<T> | Failure<CommandOutput> {
    if (!result.success) {
        return commandFailure(result.data);
    }
    return result;
}
