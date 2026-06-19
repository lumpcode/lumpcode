import { Context } from "./Context";
import { GitAndWorkspaceFnsInput } from "./GitAndWorkspaceFnsInput";

export type GitAddCommandFn = (input: Omit<GitAndWorkspaceFnsInput, 'contextList'> & { context: Context }) => string;
