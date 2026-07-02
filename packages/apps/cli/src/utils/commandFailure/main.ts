import { failure, type Failure, type Success } from '@lumpcode/core';

import type { CommandOutput } from '../../types';

export function commandFailure(message: string): Failure<CommandOutput> {
    return failure({ messages: [message] });
}

/** Maps a string `Failure` from a util into a command-handler `Failure<CommandOutput>`. */
export function unwrapOrCommandFailure<T>(
    result: Success<T> | Failure<string>,
): Success<T> | Failure<CommandOutput> {
    if (!result.success) {
        return commandFailure(result.data);
    }
    return result;
}
