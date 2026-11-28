import type { Context } from '@lumpcode/core';

export interface SetTaskDoneInput {
    workspacePath: string;
    context: Context;
    /** Context variable holding the backlog items directory. Default `BACKLOG_ITEMS_DIR`. */
    itemsDirVarName?: string;
}

/**
 * Workflow version of `folderSetTaskDoneStep`.
 * Moves the item from `todo/` to the same relative path under `completed/` and stamps `completedAt`.
 */
export async function setTaskDone(_input: SetTaskDoneInput): Promise<{ succeeded: boolean; message?: string }> {
    throw new Error('setTaskDone is not implemented.');
}
