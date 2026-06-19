import { failure, type Failure } from '@lumpcode/core';

import type { CommandOutput } from '../../types';

export function commandFailure(message: string): Failure<CommandOutput> {
    return failure({ messages: [message] });
}
