import * as z from 'zod';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import {
    commandFailure,
    createCliLogger,
    getJsConfigFromLumpName,
    isRunLumpBranchWorkspaceBusyFailure,
    isRunLumpExecutionWorkspaceBusyFailure,
    readLocalConfig,
    runLumpFromJsConfig,
    runLumpFromJsConfigFailureMessage,
    RunLumpFromJsConfigSuccess,
} from '../../utils';
import { execAsync, failure, shellSingleQuote, success } from '@lumpcode/core';
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

    const jsConfResult = await getJsConfigFromLumpName({
        lumpName,
        localConfigFolderPath,
    });
    if (!jsConfResult.success) return commandFailure(jsConfResult.data);

    const localConfigResult = await readLocalConfig({ localConfigFolderPath });
    if (!localConfigResult.success) return commandFailure(localConfigResult.data);
    const localConfig = localConfigResult.data;

    let dedicatedRestoreBranch: string | undefined;
    if (localConfig.mode === 'dedicated') {
        const branchResult = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: projectRoot });
        if (branchResult.success) {
            dedicatedRestoreBranch = branchResult.data.stdout.trim();
        }
    }

    try {
        const effectiveVerbose = !!cliVerbose || !!jsConfResult.data.verbose;
        const logger = createCliLogger({ verbose: effectiveVerbose, json: !!json });

        const runLumpRes = await runLumpFromJsConfig({
            jsConfig: jsConfResult.data,
            lumpName,
            localConfigFolderPath,
            globalConfigFolderPath,
            sourceProjectRoot: projectRoot,
            logger,
        });
        if (!runLumpRes.success) {
            const errData = runLumpRes.data;
            if (
                isRunLumpBranchWorkspaceBusyFailure(errData) ||
                isRunLumpExecutionWorkspaceBusyFailure(errData)
            ) {
                return failure({
                    messages: [errData.message],
                    data: errData,
                });
            }
            return commandFailure(runLumpFromJsConfigFailureMessage(errData));
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
    } finally {
        if (dedicatedRestoreBranch) {
            await execAsync(`git switch ${shellSingleQuote(dedicatedRestoreBranch)}`, { cwd: projectRoot });
        }
    }
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
