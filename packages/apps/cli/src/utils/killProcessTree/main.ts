import type { Failure, Success } from '@lumpcode/core';
import { failure } from '@lumpcode/core';

export async function killProcessTree(input: {
    pid: number;
}): Promise<Success<void> | Failure<string>> {
    void input;
    return failure('not implemented');
}
