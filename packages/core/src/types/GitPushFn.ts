import { Failure } from "./Failure";
import { GitAndWorkspaceFnsInput } from "./GitAndWorkspaceFnsInput";
import { Maybe } from "./Maybe";
import { MaybePromise } from "./MaybePromise";
import { Success } from "./Success";

/**
 * Once-per-branch push. Return `success(string)` for core to `execAsync`,
 * `success(null|undefined)` when work is already done / intentional skip,
 * or `failure(msg)` (log-only; run stays success).
 */
export type GitPushFn = (
    input: GitAndWorkspaceFnsInput,
) => MaybePromise<Success<Maybe<string>> | Failure<string>>;
