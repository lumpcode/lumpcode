import * as path from 'node:path';

import {
    collectStepsForContext,
    type CollectedStep,
    type Context,
    defaultGitAddCommandFn,
    defaultGitCommitCommandFn,
    defaultGitPushCommandFn,
    failure,
    type Failure,
    getCodeBasePaths,
    getToDoContextList,
    success,
    type Success,
} from '@lumpcode/core';

import { countOpenLumpBranches } from '../countOpenLumpBranches';
import { getJsConfigFromLumpName } from '../getJsConfigFromLumpName';
import { jsConfigToRunLumpInput } from '../jsConfigToRunLumpInput';
import { lumpImportBasePath } from '../lumpDirPath';
import { resolveLumpDisabled } from '../resolveLumpDisabled';
import { resolveProjectExecutionContext } from '../resolveProjectExecutionContext';

export type LumpPlanDepth = 'validate' | 'contexts' | 'prompts' | 'plan';

export type PlanLumpContextEntry = {
    name: string;
    variables: Context['variables'];
    options?: Context['options'];
};

export type PlanLumpOutput = {
    lumpName: string;
    valid: true;
    disabled: boolean;
    baseBranch: string;
    executionWorkspacePath: string;
    mode: string;
    workspaceStrategy: string;
    contexts?: PlanLumpContextEntry[];
    todoContextNames?: string[];
    promptsByContext?: Record<string, CollectedStep[]>;
    plan?: {
        skipped?: {
            reason: 'tooManyOpenBranches';
            reasonDetail: string;
            openBranchCount: number;
            maximumNumberOfConcurrentBranches: number;
        };
        branchName?: string;
        setupWorkspaceCommand?: string;
        workspacePath?: string;
        contextNames?: string[];
        teardownWorkspaceCommand?: string;
        gitCommandsByContext?: Record<string, { gitAdd: string; gitCommit: string }>;
        gitPushCommand?: string;
    };
};

export async function planLumpFromJsConfig(input: {
    lumpName: string;
    localConfigFolderPath: string;
    globalConfigFolderPath: string;
    projectRoot: string;
    depth: LumpPlanDepth;
    todoOnly?: boolean;
    contextName?: string;
}): Promise<Success<PlanLumpOutput> | Failure<string>> {
    const {
        lumpName,
        localConfigFolderPath,
        globalConfigFolderPath,
        projectRoot,
        depth,
        todoOnly,
        contextName,
    } = input;

    const jsConfResult = await getJsConfigFromLumpName({ lumpName, localConfigFolderPath });
    if (!jsConfResult.success) return jsConfResult;
    const jsConfig = jsConfResult.data;

    const disabledResult = await resolveLumpDisabled(jsConfig.disabled, {
        importBasePath: lumpImportBasePath({ localConfigFolderPath, lumpName }),
    });
    if (!disabledResult.success) return disabledResult;

    const execContextResult = await resolveProjectExecutionContext({
        sourceProjectRoot: projectRoot,
        localConfigFolderPath,
        globalConfigFolderPath,
    });
    if (!execContextResult.success) return execContextResult;
    const {
        executionWorkspacePath,
        projectBaseBranch,
        mode,
        workspaceStrategy,
    } = execContextResult.data;

    const runLumpInputResult = await jsConfigToRunLumpInput({
        config: jsConfig,
        lumpName,
        localConfigFolderPath,
        globalConfigFolderPath,
        projectBaseBranch,
        executionWorkspacePath,
        workspaceStrategy,
    });
    if (!runLumpInputResult.success) return runLumpInputResult;

    const runLumpInput = runLumpInputResult.data;
    const baseBranch = runLumpInput.baseBranch;

    const baseOutput: PlanLumpOutput = {
        lumpName,
        valid: true,
        disabled: disabledResult.data.disabled,
        baseBranch,
        executionWorkspacePath,
        mode,
        workspaceStrategy,
    };

    if (depth === 'validate') {
        return success(baseOutput);
    }

    const codeBasePathsResult = await getCodeBasePaths({ cwd: projectRoot });
    if (!codeBasePathsResult.success) {
        return failure(codeBasePathsResult.data.message);
    }

    const lumpVariables = runLumpInput.lumpVariables ?? {};
    let contexts = await runLumpInput.getContextListFn({
        codeBasePaths: codeBasePathsResult.data,
        lumpVariables,
    });

    if (todoOnly) {
        const todoResult = await getToDoContextList({
            getContextListFn: runLumpInput.getContextListFn,
            lumpVariables,
            projectRoot,
            baseBranch,
            gitCommitMessageFn: runLumpInput.gitCommitMessageFn!,
        });
        if (!todoResult.success) {
            return failure(todoResult.data.message);
        }
        const todoNames = new Set(todoResult.data.map((c) => c.name));
        contexts = contexts.filter((c) => todoNames.has(c.name));
        baseOutput.todoContextNames = todoResult.data.map((c) => c.name);
    }

    if (contextName) {
        contexts = contexts.filter((c) => c.name === contextName);
        if (contexts.length === 0) {
            return failure(`Context "${contextName}" not found in resolved context list`);
        }
    }

    baseOutput.contexts = contexts.map((c) => ({
        name: c.name,
        variables: c.variables,
        ...(c.options && { options: c.options }),
    }));

    if (depth === 'contexts') {
        return success(baseOutput);
    }

    const workspacePathForPreview = runLumpInput.projectRoot;
    const promptsByContext: Record<string, CollectedStep[]> = {};

    for (let i = 0; i < contexts.length; i++) {
        const context = contexts[i];
        const steps = await collectStepsForContext({
            context,
            contextList: contexts,
            currentContextIndex: i,
            lumpVariables,
            steps: runLumpInput.steps,
            setupFn: runLumpInput.setupFn!,
            projectRoot: runLumpInput.projectRoot,
            workspacePath: workspacePathForPreview,
        });
        promptsByContext[context.name] = steps;
    }

    baseOutput.promptsByContext = promptsByContext;

    if (depth === 'prompts') {
        return success(baseOutput);
    }

    // depth === 'plan'

    const { maximumNumberOfConcurrentBranches } = jsConfig;
    if (
        typeof maximumNumberOfConcurrentBranches === 'number' &&
        maximumNumberOfConcurrentBranches >= 0
    ) {
        const openBranchCount = await countOpenLumpBranches({ executionWorkspacePath, lumpName });
        if (openBranchCount >= maximumNumberOfConcurrentBranches) {
            baseOutput.plan = {
                skipped: {
                    reason: 'tooManyOpenBranches',
                    openBranchCount,
                    maximumNumberOfConcurrentBranches,
                    reasonDetail:
                        `Lump "${lumpName}" has ${openBranchCount} open branch(es), ` +
                        `which meets or exceeds maximumNumberOfConcurrentBranches ` +
                        `(${maximumNumberOfConcurrentBranches}).`,
                },
            };
            return success(baseOutput);
        }
    }

    const numberOfContextsPerBranch = runLumpInput.numberOfContextsPerBranch ?? 1;
    const batchContexts = contexts.slice(0, numberOfContextsPerBranch);

    if (batchContexts.length === 0) {
        baseOutput.plan = {
            contextNames: [],
            branchName: '',
        };
        return success(baseOutput);
    }

    const branchName = await runLumpInput.branchFn({
        contextList: batchContexts,
        contextRunStateList: [],
        lumpVariables,
    });

    const gitAddCommandFn = runLumpInput.gitAddCommandFn ?? defaultGitAddCommandFn;
    const gitCommitCommandFn = runLumpInput.gitCommitCommandFn ?? defaultGitCommitCommandFn;
    const gitPushCommandFn = runLumpInput.gitPushCommandFn ?? defaultGitPushCommandFn;

    const workspaceSetup = await runLumpInput.setupWorkspaceFn!({
        baseBranch,
        branchName,
        contextList: batchContexts,
    });

    const gitCommandsByContext: Record<string, { gitAdd: string; gitCommit: string }> = {};
    for (const context of batchContexts) {
        const perContextInput = {
            baseBranch,
            branchName,
            contextList: batchContexts,
            workspacePath: workspaceSetup.workspacePath,
            context,
        };
        const commitMessage = runLumpInput.gitCommitMessageFn!({
            context,
            lumpVariables,
            baseBranch,
        });
        gitCommandsByContext[context.name] = {
            gitAdd: gitAddCommandFn(perContextInput),
            gitCommit: gitCommitCommandFn({ ...perContextInput, commitMessage }),
        };
    }

    const teardownWorkspaceCommand = await runLumpInput.teardownWorkspaceFn!({
        baseBranch,
        branchName,
        contextList: batchContexts,
        workspacePath: workspaceSetup.workspacePath,
    });

    baseOutput.plan = {
        branchName,
        setupWorkspaceCommand: workspaceSetup.command,
        workspacePath: workspaceSetup.workspacePath,
        contextNames: batchContexts.map((c) => c.name),
        teardownWorkspaceCommand,
        gitCommandsByContext,
        gitPushCommand: gitPushCommandFn({
            baseBranch,
            branchName,
            contextList: batchContexts,
            workspacePath: workspaceSetup.workspacePath,
        }),
    };

    return success(baseOutput);
}
