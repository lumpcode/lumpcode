import { ContextList } from "./ContextList";
import { ContextResult } from "./ContextResult";

export interface GitAndWorkspaceFnsInput {
    baseBranch: string;
    branchName: string;
    contextList: ContextList;
    workspacePath: string;
    /** Setup: []. Workspace teardown: one result per context run, in run order. */
    contextResults: ContextResult[];
}