import { execSync } from 'node:child_process';

import * as z from 'zod';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import {
    commandFailure,
    createCliLogger,
    getJsConfigFromLumpName,
    isBranchWorkspaceBusyError,
    readLocalConfig,
    resolvePrimaryProjectBaseBranch,
    resolveProjectBaseBranches,
    runProjectPreflight,
    runLumpFromJsConfig,
    RunLumpFromJsConfigSuccess,
    validateLumpBaseBranchAllowlist,
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

    const resolvedBaseBranch =
        jsConfResult.data.baseBranch ?? resolvePrimaryProjectBaseBranch(localConfig);
    const allowlistResult = validateLumpBaseBranchAllowlist({
        lumpName,
        resolvedBaseBranch,
        effectiveBranches: resolveProjectBaseBranches(localConfig),
        allowUnlistedBaseBranch: jsConfResult.data.allowUnlistedBaseBranch,
    });
    if (!allowlistResult.success) return commandFailure(allowlistResult.data);

    let checkoutBranchBeforePreflight: string | undefined;
    if (localConfig.mode === 'dedicated') {
        try {
            checkoutBranchBeforePreflight = execSync('git rev-parse --abbrev-ref HEAD', {
                cwd: projectRoot,
                encoding: 'utf-8',
            }).trim();
        } catch {
            checkoutBranchBeforePreflight = undefined;
        }
    }

    const preflightResult = await runProjectPreflight({
        sourceProjectRoot: projectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
        targetBranch: resolvedBaseBranch,
    });
    if (!preflightResult.success) return commandFailure(preflightResult.data);
    const { executionWorkspacePath, projectBaseBranch, workspaceStrategy, mode } = preflightResult.data;

    const effectiveVerbose = !!cliVerbose || !!jsConfResult.data.verbose;
    const logger = createCliLogger({ verbose: effectiveVerbose, json: !!json });

    let runResult;
    try {
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
        runResult = runLumpRes;
    } finally {
        if (
            mode === 'dedicated' &&
            checkoutBranchBeforePreflight !== undefined &&
            checkoutBranchBeforePreflight.length > 0
        ) {
            const quotedBranch = shellSingleQuote(checkoutBranchBeforePreflight);
            const switchResult = await execAsync(`git switch -f ${quotedBranch}`, { cwd: projectRoot });
            if (!switchResult.success) {
                logger.error(
                    `Could not restore checkout branch "${checkoutBranchBeforePreflight}": ${switchResult.data.message}`,
                );
            }
        }
    }

    const runLumpRes = runResult;
    if (!runLumpRes) {
        return commandFailure('Lump run did not complete');
    }
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
