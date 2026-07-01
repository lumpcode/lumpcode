import * as z from 'zod';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import {
    commandFailure,
    createCliLogger,
    getJsConfigFromLumpName,
    isBranchWorkspaceBusyError,
    readLocalConfig,
    readProjectJsonBaseBranch,
    resolveDiscoveryBranches,
    resolveLumpBranches,
    runProjectPreflight,
    runLumpFromJsConfig,
    RunLumpFromJsConfigSuccess,
    validateLumpDiscoveryBranchAllowlist,
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

    const projectJsonBaseBranch = await readProjectJsonBaseBranch({ localConfigFolderPath });
    const { resolvedDiscoveryBranch, resolvedBaseBranch } = resolveLumpBranches({
        lumpConfig: jsConfResult.data,
        localConfig,
        projectJsonBaseBranch,
    });

    const allowlistResult = validateLumpDiscoveryBranchAllowlist({
        mode: localConfig.mode,
        lumpName,
        resolvedDiscoveryBranch,
        effectiveDiscoveryBranches: resolveDiscoveryBranches(localConfig),
    });
    if (!allowlistResult.success) return commandFailure(allowlistResult.data);

    let dedicatedRestoreBranch: string | undefined;
    if (localConfig.mode === 'dedicated') {
        const branchResult = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: projectRoot });
        if (branchResult.success) {
            dedicatedRestoreBranch = branchResult.data.stdout.trim();
        }
    }

    try {
        const preflightResult = await runProjectPreflight({
            sourceProjectRoot: projectRoot,
            localConfigFolderPath,
            globalConfigFolderPath,
            targetBranch: resolvedBaseBranch,
        });
        if (!preflightResult.success) return commandFailure(preflightResult.data);
        const { executionWorkspacePath, projectBaseBranch, workspaceStrategy } = preflightResult.data;

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
