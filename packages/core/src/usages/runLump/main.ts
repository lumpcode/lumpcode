import { Success, Failure, BranchFn, GetContextListFn, SetupFn, LumpVariables, StepVariables, TeardownFn, Steps, GitAddCommandFn, GitCommitCommandFn, GitCommitMessageFn, GitPushCommandFn, SetupWorkspaceFn, TeardownWorkspaceFn, ExtractSuccess, Context, Logger, ExecuteStepsFailureData } from "../../types";
import { createConsoleLogger, set, success } from "../../utils";
import { 
    getToDoContextList,
    executeStepsForContextList,
    ExecuteStepsForContextListResult,
} from "../../helpers";
import { defaultGitAddCommandFn, defaultGitCommitCommandFn, defaultGitCommitMessageFn, defaultGitPushCommandFn, defaultSetupWorkspaceFn, defaultTeardownWorkspaceFn } from "./defaultInjectedFns";

export async function runLump<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
>(input: RunLumpInput<V, SV>): Promise<
Success<RunLumpOutput> | 
Failure<ExecuteStepsFailureData>
> {
    const { 
        baseBranch,
        branchFn,
        lumpVariables: lumpVariablesInput,
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
        signal,
    } = input;

    const lumpVariables = (lumpVariablesInput ?? {}) as V;
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
        signal,
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

export interface RunLumpInput<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> {
    projectRoot: string;
    baseBranch: string;
    branchFn: BranchFn<V>;
    getContextListFn: GetContextListFn<V>;
    steps: Steps<V, SV>;
    numberOfContextsPerBranch?: number;
    lumpVariables?: V;
    setupFn?: SetupFn<V>;
    teardownFn?: TeardownFn<V>;
    gitAddCommandFn?: GitAddCommandFn;
    gitCommitCommandFn?: GitCommitCommandFn;
    gitCommitMessageFn?: GitCommitMessageFn<V>;
    gitPushCommandFn?: GitPushCommandFn;
    setupWorkspaceFn?: SetupWorkspaceFn;
    teardownWorkspaceFn?: TeardownWorkspaceFn;
    logger?: Logger;
    getKeepHistoryFilePathFn?: (context: Context) => string | undefined;
    /** When aborted, in-flight commands are killed and the step walk stops (ignores continueOnError). */
    signal?: AbortSignal;
}

export interface RunLumpOutput {
    result: ExtractSuccess<ExecuteStepsForContextListResult>;
}
