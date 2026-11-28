import type { Context } from '@lumpcode/core';

import { folderSetTaskDoneStep } from '../folderSetTaskDoneStep';

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
export async function setTaskDone(
    input: SetTaskDoneInput,
): Promise<{ succeeded: boolean; message?: string }> {
    const itemsDirVarName = input.itemsDirVarName ?? 'BACKLOG_ITEMS_DIR';
    const itemsDir = input.context.variables[itemsDirVarName];
    if (typeof itemsDir !== 'string' || itemsDir.length === 0) {
        throw new Error(
            `setTaskDone: context "${input.context.name}" must set ${itemsDirVarName} to the backlog items directory`,
        );
    }

    const step = folderSetTaskDoneStep({ itemsDirVarName });
    if (!step.commandFn) {
        throw new Error('setTaskDone: move step has no command');
    }
    await step.commandFn({
        context: input.context,
        prompt: '',
        stepIndex: 0,
        contextRunState: {},
        lumpVariables: {},
        projectRoot: input.workspacePath,
        workspacePath: input.workspacePath,
    });
    return { succeeded: true };
}
