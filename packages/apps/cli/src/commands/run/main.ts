import * as z from 'zod';

import { Command, CommandHandlerMaker } from '../../types';
import { baseCommandOptionsSchema } from '../../schemas/baseCommandOptions';
import {
    applyLumpConfigDefaults,
    commandFailure,
    commitSharedRunReview,
    createCliLogger,
    getJsConfigFromLumpName,
    installRunAbortHandlers,
    isRunLumpWorkspacePathBusyFailure,
    promptSharedRunReview,
    readProjectLocalConfig,
    resolveEffectiveDiscoveryBranch,
    runLumpFromJsConfigFailureMessage,
    runLumpFromLumpName,
    shouldPromptSharedRunReview,
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

    const resolvedResult = await readProjectLocalConfig({ localConfigFolderPath });
    if (!resolvedResult.success) return commandFailure(resolvedResult.data);
    const localConfig = resolvedResult.data;

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
    let disposeAbortHandlers: (() => void) | undefined;

    try {
        const jsConfForVerbose = await getJsConfigFromLumpName({ lumpName, localConfigFolderPath });
        const effectiveForVerbose = jsConfForVerbose.success
            ? applyLumpConfigDefaults({
                  jsConfig: jsConfForVerbose.data,
                  resolved: resolvedResult.data,
              })
            : undefined;
        const logger = createCliLogger({
            verbose: !!cliVerbose || !!effectiveForVerbose?.verbose,
            json: !!json,
        });

        disposeAbortHandlers = installRunAbortHandlers({
            abortController,
            logger,
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

        const runSuccess = runLumpRes.data;
        if (shouldPromptSharedRunReview({ mode: localConfig.mode, run: runSuccess })) {
            disposeAbortHandlers?.();
            disposeAbortHandlers = undefined;

            const porcelainResult = await execAsync('git status --porcelain', { cwd: projectRoot });
            const porcelainLines = porcelainResult.success
                ? porcelainResult.data.stdout.split('\n').filter((line) => line.length > 0)
                : [];
            const review = await promptSharedRunReview({
                stdin: process.stdin,
                stdout: process.stdout,
                json: !!json,
                porcelainLines,
            });
            if (review.data === 'commit') {
                const commitRes = await commitSharedRunReview({
                    cwd: projectRoot,
                    lumpName,
                    contextNames: runSuccess.result.contextNames,
                });
                if (!commitRes.success) {
                    return failure({
                        messages: [commitRes.data.message],
                        data: commitRes.data,
                    });
                }
                return success({
                    messages: [
                        `Committed LUMP markers for: ${runSuccess.result.contextNames.join(', ')}`,
                        'Contexts stay toDo until you push this branch. The next lumpcode run will pick them again.',
                        'SUCCESS: Lump run successfully',
                    ],
                    data: runSuccess,
                });
            }
        }
        return success({
            messages: ["SUCCESS: Lump run successfully"],
            data: runSuccess,
        });
    } finally {
        disposeAbortHandlers?.();
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
