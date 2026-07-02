import { GitAndWorkspaceFnsInput } from "./GitAndWorkspaceFnsInput";

export type SetupWorkspaceAfterExecFn = (input: {
    workspacePath: GitAndWorkspaceFnsInput['workspacePath'];
}) => void | Promise<void>;

export type SetupWorkspaceFn = (input: Omit<GitAndWorkspaceFnsInput, 'workspacePath'>) => Promise<{
    command: string;
    workspacePath: GitAndWorkspaceFnsInput['workspacePath'];
    afterExec?: SetupWorkspaceAfterExecFn;
}>;
