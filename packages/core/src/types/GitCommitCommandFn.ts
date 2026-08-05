import { Context } from "./Context";
import { GitAndWorkspaceFnsInput } from "./GitAndWorkspaceFnsInput";
import { Maybe } from "./Maybe";
import { MaybePromise } from "./MaybePromise";

/**
 * Returns a shell command for core to `execAsync`, or null/undefined when the
 * injector already performed the work (or intentionally no-ops).
 */
export type GitCommitCommandFn = (
    input: Omit<GitAndWorkspaceFnsInput, 'contextList'> & {
        context: Context;
        commitMessage: string;
    },
) => MaybePromise<Maybe<string>>;
