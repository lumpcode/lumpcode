import type { AgentResult, ShellResult } from '@lumpcode/core';

/** Return `result` when it succeeded. Otherwise throw, with `result` as `cause`. */
export function mustSucceed<R extends ShellResult | AgentResult>(result: R, message?: string): R {
    void result;
    void message;
    throw new Error('not implemented');
}
