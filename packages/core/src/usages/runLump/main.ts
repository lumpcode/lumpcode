import { Success, Failure, BranchFn, GetContextListFn, SetupFn, LumpVariables, TeardownFn, Steps, GitAddCommandFn, GitCommitCommandFn, GitCommitMessageFn, GitPushCommandFn, SetupWorkspaceFn, TeardownWorkspaceFn, ExtractSuccess, Context, Logger } from "../../types";
import { createConsoleLogger, set, success } from "../../utils";
import { 
    getToDoContextList,
    executeStepsForContextList,
    ExecuteStepsForContextListResult,
} from "../../helpers";
import { defaultGitAddCommandFn, defaultGitCommitCommandFn, defaultGitCommitMessageFn, defaultGitPushCommandFn, defaultSetupWorkspaceFn, defaultTeardownWorkspaceFn } from "./defaultInjectedFns";

export async function runLump<V extends LumpVariables = LumpVariables>(input: RunLumpInput<V>): Promise<
Success<RunLumpOutput> | 
Failure<{ message: string; }>
> {
    const { 
        baseBranch,
        branchFn,
        lumpVariables = {},
        getContextListFn,
        gitAddCommandFn = defaultGitAddCommandFn,
        gitCommitCommandFn = defaultGitCommitCommandFn,
        gitCommitMessageFn = defaultGitCommitMessageFn,
        gitPushCommandFn = defaultGitPushCommandFn,
        numberOfContextsPerBranch = 1,
        projectRoot,
        steps,
        setupFn = () => ({ contextRunState: {} }),
        setupWorkspaceFn = defaultSetupWorkspaceFn,
        teardownFn = () => undefined,
        teardownWorkspaceFn = defaultTeardownWorkspaceFn,
        getKeepHistoryFilePathFn = () => undefined,
        logger: loggerInput,
    } = input;

    const logger = loggerInput ?? createConsoleLogger({});
    

    const contextListToDoResult = await getToDoContextList({
        getContextListFn,
        lumpVariables,
        projectRoot,
        baseBranch,
        gitCommitMessageFn,
        logger,
    });

    if (!contextListToDoResult.success) {
        return set(
            contextListToDoResult,
            ['data', 'message'],
            "Error in runLump: Failed to get to do context list. Original Error: " + contextListToDoResult.data.message
        );
    }

    const contextListToDo = contextListToDoResult.data;

    const nextContextsForBranchList = contextListToDo.slice(
        0,
        numberOfContextsPerBranch
    );

    if (nextContextsForBranchList.length === 0) {
        logger.verbose('no next contexts for branch');
        return success({
            result: {
                updatedGroupStatusRecord: {
                    data: {},
                },
                branchName: '',
                contextNames: [],
                contextRunStateList: [],
            },
        });
    }

    const executeStepsResult = await executeStepsForContextList({
        baseBranch: baseBranch,
        branchFn: branchFn,
        lumpVariables: lumpVariables,
        contextList: nextContextsForBranchList,
        gitAddCommandFn,
        gitCommitCommandFn,
        gitCommitMessageFn,
        gitPushCommandFn,
        projectRoot,
        steps,
        setupFn,
        setupWorkspaceFn,
        teardownFn,
        teardownWorkspaceFn,
        logger,
        getKeepHistoryFilePathFn,
    });

    if (!executeStepsResult.success) {
        return set(
            executeStepsResult,
            ['data', 'message'],
            "Error in runLump: Failed to execute steps for context list. Original Error: " + executeStepsResult.data.message
        );
    }

    return success({
        result: executeStepsResult.data,
    });
}

export interface RunLumpInput<V extends LumpVariables = LumpVariables> {
    projectRoot: string;
    baseBranch: string;
    branchFn: BranchFn;
    getContextListFn: GetContextListFn;
    steps: Steps;
    numberOfContextsPerBranch?: number;
    lumpVariables?: V;
    setupFn?: SetupFn;
    teardownFn?: TeardownFn;
    gitAddCommandFn?: GitAddCommandFn;
    gitCommitCommandFn?: GitCommitCommandFn;
    gitCommitMessageFn?: GitCommitMessageFn;
    gitPushCommandFn?: GitPushCommandFn;
    setupWorkspaceFn?: SetupWorkspaceFn;
    teardownWorkspaceFn?: TeardownWorkspaceFn;
    logger?: Logger;
    getKeepHistoryFilePathFn?: (context: Context) => string | undefined;
}

export interface RunLumpOutput {
    result: ExtractSuccess<ExecuteStepsForContextListResult>;
}
