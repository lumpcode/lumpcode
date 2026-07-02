import * as z from 'zod';

import { failure, success } from '@lumpcode/core';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import type { ContextStatusRecordItem } from '../../types/ContextStatusRecord';
import { unwrapOrCommandFailure } from '../../utils/commandFailure';
import { getJsConfigFromLumpName } from '../../utils/getJsConfigFromLumpName';
import { setContextToFinishedStatus } from '../../utils/setContextToFinishedStatus';
import { updateContextStatusRecord } from '../../utils/updateContextStatusRecord';
import { validateCurrentLumpProjectRoot } from '../../utils/validateCurrentLumpProjectRoot';

const inputSchema = z.object({
    options: baseCommandOptionsSchema.extend({
        setToFinished: z
            .boolean()
            .optional()
            .describe('Create marker commit on baseBranch and push (mark context finished)'),
    }),
    arguments: z.object({
        lumpName: z.string().describe('Name of the lump containing the context'),
        contextName: z.string().describe('Name of the context to inspect or update'),
    }),
});

export type Input = z.infer<typeof inputSchema>;

export type Output = {
    messages: string[];
    data?: {
        item: ContextStatusRecordItem;
    };
};

export interface Injections {
    projectRoot: string;
    localConfigFolderPath: string;
}


const handlerMaker: CommandHandlerMaker<Injections, Input, Output> = (injections) => async (input) => {
    const { projectRoot, localConfigFolderPath } = injections;
    const { lumpName, contextName } = input.arguments;
    const setToFinished = input.options.setToFinished ?? false;

    const validationResult = unwrapOrCommandFailure(
        await validateCurrentLumpProjectRoot({ cwd: projectRoot }),
    );
    if (!validationResult.success) return validationResult;

    const jsConfResult = unwrapOrCommandFailure(
        await getJsConfigFromLumpName({ lumpName, localConfigFolderPath }),
    );
    if (!jsConfResult.success) return jsConfResult;
    const jsConfig = jsConfResult.data;
    const baseBranch = jsConfig.baseBranch;
    if (!baseBranch) {
        return failure({
            messages: [`Lump "${lumpName}" is missing baseBranch in its config.`],
        });
    }

    if (setToFinished) {
        const finishResult = unwrapOrCommandFailure(
            await setContextToFinishedStatus({
                projectRoot,
                contextName,
                lumpName,
                baseBranch,
            }),
        );
        if (!finishResult.success) return finishResult;
    }

    const updateResult = await updateContextStatusRecord({
        projectRoot,
        lumpName,
        baseBranch,
    });
    if (!updateResult.success) {
        const err = updateResult.data;
        const message =
            typeof err === 'string' ? err : 'message' in err ? String(err.message) : JSON.stringify(err);
        return failure({
            messages: [`Failed to refresh context status: ${message}`],
        });
    }

    const record = updateResult.data;
    const recordItem = record[contextName] || {
        status: 'toDo',
        contextName,
        branchName: '',
        commitMessage: '',
    };

    const jsonLine = JSON.stringify(recordItem, null, 2);
    const messages = [jsonLine];

    return success({
        messages,
        data: { item: recordItem },
    });
};

export const command = {
    handlerMaker,
    name: 'context-status',
    description: 'Inspect or update the status of a single context within a lump',
    inputSchema,
} satisfies Command;
