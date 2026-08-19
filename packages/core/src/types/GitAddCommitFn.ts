import { Context } from "./Context";
import { Failure } from "./Failure";
import { GitAndWorkspaceFnsInput } from "./GitAndWorkspaceFnsInput";
import { Maybe } from "./Maybe";
import { MaybePromise } from "./MaybePromise";
import { Success } from "./Success";

/**
 * Per-context add+commit. Return `success(string)` for core to `execAsync`,
 * `success(null|undefined)` when work is already done / intentional skip,
 * or `failure(msg)` to hard-fail the run.
 */
export type GitAddCommitFn = (
    input: Omit<GitAndWorkspaceFnsInput, 'contextList'> & {
        context: Context;
        commitMessage: string;
    },
) => MaybePromise<Success<Maybe<string>> | Failure<string>>;
