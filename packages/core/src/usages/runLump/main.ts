import { Success, Failure, BranchFn, GetContextListFn, SetupFn, LumpVariables, StepVariables, TeardownFn, Steps, GitAddCommitFn, GitCommitMessageFn, GitPushFn, SetupWorkspaceFn, TeardownWorkspaceFn, Context, ContextResult, ContextRunState, Logger, ExecuteStepsFailureData, CommandOutputEvent, WorkflowFn, CreateAgentInput, Agent } from "../../types";
import { createConsoleLogger, failure, set, success } from "../../utils";
import { 
    getToDoContextList,
    executeStepsForContextList,
    type RefreshRemoteTrackingRefsFn,
} from "../../helpers";
import { workflowToSteps } from "../../helpers/workflowToSteps/main";
import { defaultGitAddCommitFn, defaultGitCommitMessageFn, defaultGitPushFn, defaultSetupWorkspaceFn, defaultTeardownWorkspaceFn } from "./defaultInjectedFns";

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
        gitAddCommitFn = defaultGitAddCommitFn,
        gitCommitMessageFn = defaultGitCommitMessageFn,
        gitPushFn = defaultGitPushFn,
        numberOfContextsPerBranch = 1,
        projectRoot,
        steps,
        workflow,
        setupFn = () => ({ contextRunState: {} }),
        setupWorkspaceFn = defaultSetupWorkspaceFn,
        teardownFn = () => undefined,
        teardownWorkspaceFn = defaultTeardownWorkspaceFn,
        getKeepHistoryFilePathFn = () => undefined,
        logger: loggerInput,
        signal,
        refreshRemoteTrackingRefsFn,
        onCommandOutput,
        lumpName,
        contextName,
        timeoutMillis,
        createAgent,
    } = input;

    if (workflow !== undefined && steps !== undefined) {
        return failure({ message: 'Use workflow or steps, not both.' });
    }

    const stepsToRun = workflow !== undefined
        ? workflowToSteps(workflow, timeoutMillis)
        : steps;

    if (stepsToRun === undefined) {
        return failure({ message: 'RunLumpInput needs steps or workflow.' });
    }

    const lumpVariables = (lumpVariablesInput ?? {}) as V;
    const logger = loggerInput ?? createConsoleLogger({});

    const contextListToDoResult = await getToDoContextList({
        getContextListFn,
        lumpVariables,
        projectRoot,
        baseBranch,
        gitCommitMessageFn,
        logger,
        refreshRemoteTrackingRefsFn,
        contextName,
    });

    if (!contextListToDoResult.success) {
        if (contextListToDoResult.data.code === 'contextName') {
            return failure({ message: contextListToDoResult.data.message });
        }
        return set(
            contextListToDoResult,
            ['data', 'message'],
            "Error in runLump: Failed to get to do context list. Original Error: " + contextListToDoResult.data.message
        );
    }

    const contextListToDo = contextListToDoResult.data;

    const nextContextsForBranchList = contextName === undefined
        ? contextListToDo.slice(0, numberOfContextsPerBranch)
        : contextListToDo;

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
        gitAddCommitFn,
        gitCommitMessageFn,
        gitPushFn,
        projectRoot,
        steps: stepsToRun,
        setupFn,
        createAgent,
        setupWorkspaceFn,
        teardownFn,
        teardownWorkspaceFn,
        logger,
        getKeepHistoryFilePathFn,
        signal,
        onCommandOutput,
        lumpName,
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
    steps?: Steps<V, SV>;
    /** One function for the context. Not together with `steps`. */
    workflow?: WorkflowFn<V, SV>;
    /** Host-supplied agent. Omitted: core's default agent. */
    createAgent?: (input: CreateAgentInput<V>) => Agent;
    /**
     * Workflow deadline when the workflow step omits `timeoutMillis`.
     * Omitted: 2 hours. Steps keep their own 30 minute default.
     */
    timeoutMillis?: number;
    numberOfContextsPerBranch?: number;
    lumpVariables?: V;
    setupFn?: SetupFn<V>;
    teardownFn?: TeardownFn<V>;
    gitAddCommitFn?: GitAddCommitFn;
    gitCommitMessageFn?: GitCommitMessageFn<V>;
    gitPushFn?: GitPushFn;
    setupWorkspaceFn?: SetupWorkspaceFn;
    teardownWorkspaceFn?: TeardownWorkspaceFn;
    logger?: Logger;
    getKeepHistoryFilePathFn?: (context: Context) => string | undefined;
    /** When aborted, in-flight commands are killed and the step walk stops (ignores continueOnError). */
    signal?: AbortSignal;
    /**
     * Optional one-shot remote refresh before context status (CLI locks this).
     * Defaults to unlocked core `refreshRemoteTrackingRefs` inside getToDoContextList.
     */
    refreshRemoteTrackingRefsFn?: RefreshRemoteTrackingRefsFn;
    /** Live step feed. Omitted callers keep today's buffered command output. */
    onCommandOutput?: (event: CommandOutputEvent) => void;
    /** Names the per-step systemd scope unit (`lump-<lumpName>-<context>-<step>-…`). */
    lumpName?: string;
    /**
     * Run this context when it is `toDo` and its `dependsOnContexts` are `finished`.
     * Priority and `numberOfContextsPerBranch` do not choose a different context.
     */
    contextName?: string;
}

export interface RunLumpOutput {
    /** `contextResults` is absent when the run had no to-do contexts. */
    result: {
        branchName: string;
        contextNames: string[];
        contextRunStateList: ContextRunState[];
        contextResults?: ContextResult[];
    };
}
