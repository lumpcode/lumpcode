import { Context } from "./Context";
import { GitAndWorkspaceFnsInput } from "./GitAndWorkspaceFnsInput";

export type GitCommitCommandFn = (input: Omit<GitAndWorkspaceFnsInput, 'contextList'> & { context: Context; commitMessage: string }) => string;
