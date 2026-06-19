import { Context, ContextStatus } from "@lumpcode/core";

export type ContextStatusRecordItem = {
    status: ContextStatus;
    contextName: Context['name'];
    branchName: string;
    commitMessage: string;
}

export type ContextStatusRecord = {
    [contextName: Context['name']]: ContextStatusRecordItem;
}
