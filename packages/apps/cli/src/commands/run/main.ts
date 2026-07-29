import * as z from 'zod';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import {
    commandFailure,
    createCliLogger,
    getJsConfigFromLumpName,
    isRunLumpWorkspacePathBusyFailure,
    readLocalConfig,
    resolveEffectiveDiscoveryBranch,
    runLumpFromJsConfigFailureMessage,
    runLumpFromLumpName,
    type RunLumpFromLumpNameSuccess,
} from '../../utils';
import { execAsync, failure, shellSingleQuote, success } from '@lumpcode/core';
import { globalConfigFolderPath, localConfigFolderPath } from '../../constants';

const inputSchema = z.object({
    options: baseCommandOptionsSchema.extend({
        discoveryBranch: z
            .string()
            .optional()
            .describe('Discovery branch override (dedicated mode; must be listed in primaryBranches)'),
    }),
    arguments: z.object({
        lumpName: z.string().describe('The name of the lump to run'),
    }),
});

export type Input = z.infer<typeof inputSchema>;

export type Output = {
    messages: string[];
    data?: RunLumpFromLumpNameSuccess;
};

export interface Injections {
    projectRoot: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
}

const handlerMaker: CommandHandlerMaker<Injections, Input, Output> = (injections) => async input => {
    const lumpName = input.arguments.lumpName;
    const discoveryBranchOpt = input.options.discoveryBranch?.trim() || undefined;
    const { json, verbose: cliVerbose } = input.options;
    const { projectRoot, localConfigFolderPath, globalConfigFolderPath } = injections;

    const localConfigResult = await readLocalConfig({ localConfigFolderPath });
    if (!localConfigResult.success) return commandFailure(localConfigResult.data);
    const localConfig = localConfigResult.data;

    const discoveryResult = await resolveEffectiveDiscoveryBranch({
        discoveryBranchOpt,
        lumpName,
        localConfigFolderPath,
        localConfig,
        warnSharedDiscoveryBranchIgnored: true,
    });
    if (!discoveryResult.success) return commandFailure(discoveryResult.data);

    let dedicatedRestoreBranch: string | undefined;
    if (localConfig.mode === 'dedicated') {
        const branchResult = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: projectRoot });
        if (branchResult.success) {
            dedicatedRestoreBranch = branchResult.data.stdout.trim();
        }
    }

    const abortController = new AbortController();
    const onSignal = () => {
        abortController.abort();
    };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);

    try {
        const jsConfForVerbose = await getJsConfigFromLumpName({ lumpName, localConfigFolderPath });
        const logger = createCliLogger({
            verbose:
                !!cliVerbose ||
                !!(jsConfForVerbose.success && jsConfForVerbose.data.verbose),
            json: !!json,
        });

        const runLumpRes = await runLumpFromLumpName({
            lumpName,
            localConfigFolderPath,
            globalConfigFolderPath,
            sourceProjectRoot: projectRoot,
            logger,
            localConfig,
            effectiveDiscoveryBranch: discoveryResult.data,
            discoveryBranchOpt,
            signal: abortController.signal,
        });
        if (!runLumpRes.success) {
            const errData = runLumpRes.data;
            if (isRunLumpWorkspacePathBusyFailure(errData)) {
                return failure({
                    messages: [errData.message],
                    data: errData,
                });
            }
            return commandFailure(runLumpFromJsConfigFailureMessage(errData));
        }
        if (runLumpRes.data.skipped) {
            const detail =
                runLumpRes.data.reason === 'disabled'
                    ? runLumpRes.data.reasonDetail
                    : runLumpRes.data.reasonDetail ?? runLumpRes.data.reason;
            return success({
                messages: [detail],
                data: runLumpRes.data,
            });
        }
        return success({
            messages: ["SUCCESS: Lump run successfully"],
            data: runLumpRes.data,
        });
    } finally {
        process.off('SIGINT', onSignal);
        process.off('SIGTERM', onSignal);
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
