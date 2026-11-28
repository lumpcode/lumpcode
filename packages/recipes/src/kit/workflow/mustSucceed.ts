import type { AgentResult, ShellResult } from '@lumpcode/core';

const OUTPUT_TAIL_LENGTH = 2000;

/** Return `result` when it succeeded. Otherwise throw, with `result` as `cause`. */
export function mustSucceed<R extends ShellResult | AgentResult>(result: R, message?: string): R {
    if (result.succeeded) {
        return result;
    }
    const head = message ?? 'failed';
    const tail = result.output.slice(-OUTPUT_TAIL_LENGTH);
    const text = tail.length === 0 ? head : `${head}\n${tail}`;
    throw Object.assign(new Error(text), { cause: result });
}
