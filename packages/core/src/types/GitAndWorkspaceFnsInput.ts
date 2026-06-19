import { ContextList } from "./ContextList";

export interface GitAndWorkspaceFnsInput {
    baseBranch: string;
    branchName: string;
    contextList: ContextList;
    workspacePath: string;
}