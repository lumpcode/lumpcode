import * as z from 'zod';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import {
    commandFailure,
    createCliLogger,
    getJsConfigFromLumpName,
    isBranchWorkspaceBusyError,
    runProjectPreflight,
    runLumpFromJsConfig,
    RunLumpFromJsConfigSuccess,
    unwrapOrCommandFailure,
} from '../../utils';
import { failure, success } from '@lumpcode/core';
import { globalConfigFolderPath, localConfigFolderPath } from '../../constants';

const inputSchema = z.object({
    options: baseCommandOptionsSchema,
    arguments: z.object({
        lumpName: z.string().describe('The name of the lump to run'),
    }),
});

export type Input = z.infer<typeof inputSchema>;

export type Output = {
    messages: string[];
    data?: RunLumpFromJsConfigSuccess;
};

export interface Injections {
    projectRoot: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
}

const handlerMaker: CommandHandlerMaker<Injections, Input, Output> = (injections) => async input => {
    const lumpName = input.arguments.lumpName;
    const { json, verbose: cliVerbose } = input.options;
    const { projectRoot, localConfigFolderPath, globalConfigFolderPath } = injections;
    const preflightResult = unwrapOrCommandFailure(
        await runProjectPreflight({
            sourceProjectRoot: projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
        }),
    );
    if (!preflightResult.success) return preflightResult;
    const { executionWorkspacePath, projectBaseBranch, workspaceStrategy } = preflightResult.data;

    const jsConfResult = unwrapOrCommandFailure(
        await getJsConfigFromLumpName({
            lumpName,
            localConfigFolderPath,
        }),
    );
    if (!jsConfResult.success) return jsConfResult;

    const effectiveVerbose = !!cliVerbose || !!jsConfResult.data.verbose;
    const logger = createCliLogger({ verbose: effectiveVerbose, json: !!json });

    const runLumpRes = await runLumpFromJsConfig({
        jsConfig: jsConfResult.data,
        lumpName,
        localConfigFolderPath,
        globalConfigFolderPath,
        projectBaseBranch,
        executionWorkspacePath,
        workspaceStrategy,
        logger,
    });
    if (!runLumpRes.success) {
        const errData = runLumpRes.data;
        if (isBranchWorkspaceBusyError(errData)) {
            return failure({
                messages: [errData.message],
                data: {
                    ...errData,
                },
            });
        }
        return commandFailure(errData);
    }
    if (runLumpRes.data.skipped) {
        return success({
            messages: [runLumpRes.data.reason],
            data: runLumpRes.data,
        });
    }
    return success({
        messages: ["SUCCESS: Lump run successfully"],
        data: runLumpRes.data,
    });
}

export const command = {
    handlerMaker,
    name: 'run',
    description: 'Run a lump',
    inputSchema,
    defaultInjections: {
        projectRoot: process.cwd(),
        localConfigFolderPath,
        globalConfigFolderPath,
    },
} satisfies Command;
