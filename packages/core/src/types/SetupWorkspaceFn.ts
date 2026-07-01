import { GitAndWorkspaceFnsInput } from "./GitAndWorkspaceFnsInput";

export type SetupWorkspaceFn = (input: Omit<GitAndWorkspaceFnsInput, 'workspacePath'>) => Promise<{
    command: string;
    workspacePath: GitAndWorkspaceFnsInput['workspacePath'];
}>;
