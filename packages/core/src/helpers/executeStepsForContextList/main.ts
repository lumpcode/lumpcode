import { execBinary } from '../execBinary';
import { execAsync } from '../execAsync';
import { 
    ContextList,  
    ContextResult,
    ContextRunState,
    ExecuteStepsFailureData,
    Failure,
    HistoryEntry,
    Logger,
    LumpVariables,
    Maybe,
    MaybePromise,
    PromptFnInput,
    Step,
    Steps,
    StepVariables,
    Success,
    WorkflowResult,
} from "../../types";
import {
    appendHistoryEntry,
    createConsoleLogger,
    detectSystemdScope,
    failure,
    formatExecFailureMessage,
    success,
    systemdScopeUnitName,
} from '../../utils';
import { GitAndWorkspaceFnsInput } from '../../types/GitAndWorkspaceFnsInput';
import type { RunLumpInput } from '../../usages';
import { createWorkflowRuntime } from '../createWorkflowRuntime/main';
import { isWorkflowStep, type WorkflowStep } from '../workflowToSteps/main';

type WalkStep<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = Steps<V, SV>[number] | WorkflowStep<V, SV>;

function normalizeWorkflowResult<SV extends StepVariables>(
    value: WorkflowResult<SV> | void,
): ContextResult<SV>['result'] {
    const result = value ?? {};
    return {
        succeeded: result.succeeded ?? true,
        push: result.push ?? true,
        ...(result.message !== undefined ? { message: result.message } : {}),
        ...(result.variables !== undefined ? { variables: result.variables } : {}),
    };
}

const ABORT_STEP_WALK_MESSAGE = 'Process aborted';

function stepWalkAbortedFailure(): Failure<ExecuteStepsFailureData> {
    return {
        success: false,
        data: {
            message: ABORT_STEP_WALK_MESSAGE,
            reason: 'stepWalkFailed',
        },
    };
}

function createStepWalkAbortError(): Error {
    const error = new Error(ABORT_STEP_WALK_MESSAGE);
    error.name = 'AbortError';
    return error;
}

function isStepWalkAbortError(error: unknown): boolean {
    return (
        typeof error === 'object'
        && error !== null
        && 'name' in error
        && (error as { name: string }).name === 'AbortError'
    );
}

/**
 * Await user-hook work, but stop waiting once `signal` aborts so the walk can
 * unwind (locks/teardown). Does not cancel sync busy-loops on the event loop.
 */
async function awaitUnlessAborted<T>(
    work: MaybePromise<T>,
    signal: AbortSignal | undefined,
): Promise<T> {
    if (!signal) {
        return await work;
    }
    signal.throwIfAborted();

    return new Promise<T>((resolve, reject) => {
        const onAbort = () => {
            cleanup();
            reject(createStepWalkAbortError());
        };
        const cleanup = () => {
            signal.removeEventListener('abort', onAbort);
        };
        signal.addEventListener('abort', onAbort, { once: true });
        Promise.resolve(work).then(
            (value) => {
                cleanup();
                resolve(value);
            },
            (error) => {
                cleanup();
                reject(error);
            },
        );
    });
}

type GitHookExecOutcome =
    | { status: 'ok' }
    | { status: 'failed'; detail: string };

/**
 * Result-aware runner for `gitAddCommitFn` / `gitPushFn`.
 * nullish Success → no-op; empty string / Failure / throw / exec fail → failed.
 */
async function runGitResultHook(input: {
    getResult: () => MaybePromise<Success<Maybe<string>> | Failure<string>>;
    cwd: string;
    logger: Logger;
    execLabel: string;
}): Promise<GitHookExecOutcome> {
    const { getResult, cwd, logger, execLabel } = input;
    try {
        const result = await getResult();
        if (!result.success) {
            return { status: 'failed', detail: result.data };
        }
        const command = result.data;
        if (command == null) {
            return { status: 'ok' };
        }
        if (command === '') {
            return { status: 'failed', detail: 'empty command string' };
        }
        const execResult = await execAsync(command, { cwd });
        logger.verbose(`${execLabel} ${JSON.stringify(execResult)}`);
        if (!execResult.success) {
            return { status: 'failed', detail: execResult.data.message };
        }
        return { status: 'ok' };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { status: 'failed', detail: message };
    }
}

export type ExecuteStepsForContextListParams<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = Omit<Required<Pick<
    RunLumpInput<V, SV>,
    | 'baseBranch' 
    | 'branchFn'
    | 'lumpVariables'
    | 'steps'
    | 'setupFn'
    | 'teardownFn'
    | 'gitAddCommitFn'
    | 'gitPushFn'
    | 'gitCommitMessageFn'
    | 'projectRoot'
    | 'setupWorkspaceFn'
    | 'teardownWorkspaceFn'
    | 'getKeepHistoryFilePathFn'
>>, 'steps'> & {
    steps: WalkStep<V, SV>[];
    contextList: ContextList;
    logger?: Logger;
    /** When aborted, in-flight commands are killed and the step walk stops (ignores continueOnError). */
    signal?: AbortSignal;
    onCommandOutput?: RunLumpInput<V, SV>['onCommandOutput'];
    lumpName?: string;
    createAgent?: RunLumpInput<V, SV>['createAgent'];
}

export async function executeStepsForContextList<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
>({
    baseBranch,
    branchFn,
    lumpVariables,
    contextList,
    gitAddCommitFn,
    gitPushFn,
    gitCommitMessageFn,
    projectRoot,
    steps,
    setupFn,
    setupWorkspaceFn,
    teardownFn,
    teardownWorkspaceFn,
    getKeepHistoryFilePathFn,
    logger: loggerInput,
    signal,
    onCommandOutput,
    lumpName,
    createAgent,
}: ExecuteStepsForContextListParams<V, SV>) {
    const logger = loggerInput ?? createConsoleLogger({});
    const contextNames = contextList.map(context => context.name);

    logger.verbose(`contextNames ${JSON.stringify(contextNames)}`);

    const contextRunStateList: ContextRunState[] = [];

    const branchName = await branchFn({ 
        contextList,
        contextRunStateList,
        lumpVariables,
    });

    logger.verbose(`branchName ${branchName}`);

    const injectedGitAndWorkspaceFnsInput: GitAndWorkspaceFnsInput = {
        baseBranch,
        branchName,
        contextList,
        workspacePath: '.',
        contextResults: [],
    };

    const { command: setupWorkspaceCommand, workspacePath, afterExec } =
        await setupWorkspaceFn(injectedGitAndWorkspaceFnsInput);

    logger.verbose(`setupWorkspaceCommand ${setupWorkspaceCommand}`);
    logger.verbose(`workspacePath ${workspacePath}`);

    if (setupWorkspaceCommand) {
        const setupWorkspaceCommandExec = await execAsync(setupWorkspaceCommand, {
            cwd: projectRoot,
        });
        logger.verbose(`setupWorkspaceCommandExec ${JSON.stringify(setupWorkspaceCommandExec)}`);
        if (!setupWorkspaceCommandExec.success) {
            return failure({
                message: `Failed to setup the workspace: ${setupWorkspaceCommandExec.data.message}`,
            });
        }

        if (afterExec) {
            await afterExec({ workspacePath });
        }
    }

    const gitStatusCommand = await execAsync(`git status`, { cwd: workspacePath });
    logger.verbose(`gitStatusCommand ${JSON.stringify(gitStatusCommand.data)}`);

    injectedGitAndWorkspaceFnsInput.workspacePath = workspacePath;

    let runFailure: Failure<ExecuteStepsFailureData> | undefined;

    try {
        for (let i = 0; i < contextList.length; i++) {
            if (signal?.aborted) {
                runFailure = stepWalkAbortedFailure();
                break;
            }

            const context = contextList[i];

            logger.info(
                contextList.length > 1
                    ? `Running context "${context.name}" (${i + 1}/${contextList.length})`
                    : `Running context "${context.name}"`,
            );

            const setupResult = await setupFn({
                contextList,
                lumpVariables,
                currentContextIndex: i,
            });

            const contextRunState = setupResult?.contextRunState || {};
            contextRunStateList[i] = contextRunState;

            let stepWalkFailure: Failure<ExecuteStepsFailureData> | undefined;
            let contextRecord: Pick<ContextResult<SV>, 'outcome' | 'result'> | undefined;

            async function writeHistory(entry: HistoryEntry<V, SV>): Promise<void> {
                const keepHistoryFilePath = getKeepHistoryFilePathFn(context) || '';
                if (keepHistoryFilePath.length === 0) return;
                const appendResult = await appendHistoryEntry({
                    filePath: keepHistoryFilePath,
                    entry,
                });
                if (!appendResult.success) {
                    logger.warn(
                        `Failed to append history entry to ${keepHistoryFilePath}: ${appendResult.data}`,
                    );
                }
            }

            async function settleWorkflow(
                normalized: ContextResult<SV>['result'],
                stepIndex: number | number[],
            ): Promise<void> {
                onCommandOutput?.({
                    kind: 'workflowEnd',
                    contextName: context.name,
                    result: normalized,
                });
                await writeHistory({
                    commandResult: normalized.message ?? '',
                    commandSucceeded: normalized.succeeded,
                    context,
                    prompt: '',
                    stepIndex,
                    contextRunState,
                    lumpVariables,
                    projectRoot,
                    kind: 'workflow',
                    workflowResult: normalized,
                    ...(normalized.variables !== undefined ? { stepVariables: normalized.variables } : {}),
                });
            }

            async function executeWorkflowStep(
                step: WorkflowStep<V, SV>,
                compositeStepIndex: number | number[],
            ): Promise<void> {
                const workflowStepIndex = typeof compositeStepIndex === 'number'
                    ? compositeStepIndex
                    : compositeStepIndex[0] ?? 0;
                const runtime = createWorkflowRuntime({
                    context,
                    lumpVariables,
                    contextRunState,
                    projectRoot,
                    workspacePath,
                    ...(step.timeoutMillis !== undefined ? { timeoutMillis: step.timeoutMillis } : {}),
                    signal,
                    onCommandOutput,
                    logger,
                    createAgent,
                    lumpName,
                    workflowStepIndex,
                    onHistoryEntry: writeHistory,
                });

                try {
                    const returned = await step.workflowFn({
                        context,
                        lumpVariables,
                        contextRunState,
                        projectRoot,
                        workspacePath,
                        signal: runtime.signal,
                        agent: runtime.agent,
                        shell: runtime.shell,
                        log: runtime.log,
                    });
                    const normalized = normalizeWorkflowResult(returned);
                    contextRecord = {
                        outcome: normalized.push ? 'pushed' : 'notPushed',
                        result: normalized,
                    };
                    await settleWorkflow(normalized, compositeStepIndex);
                    if (!normalized.push) {
                        stepWalkFailure = {
                            success: false,
                            data: {
                                message: normalized.message ?? 'Workflow did not push.',
                                reason: 'workflowNotPushed',
                            },
                        };
                    }
                } catch (error) {
                    if (isStepWalkAbortError(error)) {
                        const result = {
                            succeeded: false,
                            push: false,
                            message: ABORT_STEP_WALK_MESSAGE,
                        };
                        contextRecord = { outcome: 'aborted', result };
                        await settleWorkflow(result, compositeStepIndex);
                        stepWalkFailure = stepWalkAbortedFailure();
                        return;
                    }
                    const message = error instanceof Error ? error.message : String(error);
                    const result = { succeeded: false, push: false, message };
                    contextRecord = { outcome: 'failed', result };
                    await settleWorkflow(result, compositeStepIndex);
                    stepWalkFailure = {
                        success: false,
                        data: {
                            message,
                            reason: 'workflowThrew',
                        },
                    };
                }
            }

            function recordContext(): void {
                if (contextRecord) {
                    injectedGitAndWorkspaceFnsInput.contextResults.push({
                        context,
                        outcome: contextRecord.outcome,
                        result: contextRecord.result,
                    });
                    return;
                }
                if (stepWalkFailure) {
                    const aborted = stepWalkFailure.data.message === ABORT_STEP_WALK_MESSAGE;
                    injectedGitAndWorkspaceFnsInput.contextResults.push({
                        context,
                        outcome: aborted ? 'aborted' : 'failed',
                        result: {
                            succeeded: false,
                            push: false,
                            message: stepWalkFailure.data.message,
                        },
                    });
                    return;
                }
                injectedGitAndWorkspaceFnsInput.contextResults.push({
                    context,
                    outcome: 'pushed',
                    result: { succeeded: true, push: true },
                });
            }

            async function walkAndExecuteSteps(
                stepsToExec: WalkStep<V, SV>[],
                currStepIndex: number[],
            ): Promise<void> {
                try {
                    for (let stepIndex = 0; stepIndex < stepsToExec.length; stepIndex++) {
                        if (stepWalkFailure) {
                            return;
                        }
                        signal?.throwIfAborted();

                        const step = stepsToExec[stepIndex];
                        const nextCallHeadIndex = [...currStepIndex, stepIndex];
                        const compositeStepIndex: number | number[] =
                            nextCallHeadIndex.length === 1 ? nextCallHeadIndex[0]! : nextCallHeadIndex;

                        if (typeof step === 'function' || Array.isArray(step)) {
                            const subSteps = typeof step === 'function'
                                ? await awaitUnlessAborted(
                                    step({
                                        context,
                                        stepIndex: compositeStepIndex,
                                        contextRunState,
                                        lumpVariables,
                                    }),
                                    signal,
                                )
                                : step;
                            await walkAndExecuteSteps(subSteps, nextCallHeadIndex);
                            continue;
                        }

                        if (isWorkflowStep<V, SV>(step)) {
                            await executeWorkflowStep(step, compositeStepIndex);
                            if (stepWalkFailure) return;
                            continue;
                        }

                        logger.verbose(`step ${JSON.stringify(step)}`);

                        const {
                            commandFn = () => null,
                            stepVariables,
                            promptFn,
                            postCommandExecFn,
                            continueOnError,
                            timeoutMillis = 1000 * 60 * 30,
                        } = step as Step<V, SV>;

                        const prompt = promptFn
                            ? await awaitUnlessAborted(
                                promptFn({
                                    context,
                                    stepIndex: compositeStepIndex,
                                    contextRunState,
                                    lumpVariables,
                                    stepVariables,
                                } satisfies PromptFnInput<V, SV>),
                                signal,
                            )
                            : '';

                        const command = await awaitUnlessAborted(
                            commandFn({
                                context,
                                prompt,
                                stepIndex: compositeStepIndex,
                                contextRunState,
                                lumpVariables,
                                stepVariables,
                                projectRoot,
                                workspacePath,
                            }),
                            signal,
                        );

                        let commandResult = '';
                        let commandSucceeded = true;

                        if (command != null) {
                            const { executable, args, env } = command;

                            logger.verbose(`command for prompt ${executable} ${args.join(' ')}`);
                            if (env != null) {
                                logger.verbose(`command env overrides ${JSON.stringify(env)}`);
                            }
                            logger.verbose(`workspacePath ${workspacePath}`);

                            const commandName = 'commandName' in commandFn && typeof commandFn.commandName === 'string'
                                ? commandFn.commandName
                                : undefined;
                            onCommandOutput?.({
                                kind: 'start',
                                contextName: context.name,
                                stepIndex: compositeStepIndex,
                                executable,
                                lumpVariables,
                                ...(stepVariables !== undefined ? { stepVariables } : {}),
                                ...(commandName ? { commandName } : {}),
                            });

                            const scopeSupport = await detectSystemdScope();
                            const commandExec = await execBinary({
                                binaryPath: executable,
                                args,
                                timeoutMillis,
                                stdio: ['inherit', 'pipe', 'pipe'],
                                cwd: workspacePath,
                                signal,
                                logger,
                                isolation: scopeSupport.available
                                    ? {
                                        kind: 'systemdScope',
                                        unitName: systemdScopeUnitName({
                                            lumpName,
                                            contextName: context.name,
                                            stepIndex: compositeStepIndex,
                                        }),
                                    }
                                    : { kind: 'processGroup' },
                                ...(env != null ? { env: { ...process.env, ...env } } : {}),
                                ...(onCommandOutput
                                    ? {
                                        onChunk: ({ stream, chunk }) => {
                                            onCommandOutput({
                                                kind: 'chunk',
                                                contextName: context.name,
                                                stepIndex: compositeStepIndex,
                                                stream,
                                                chunk,
                                            });
                                        },
                                    }
                                    : {}),
                            });
                            onCommandOutput?.({
                                kind: 'end',
                                contextName: context.name,
                                stepIndex: compositeStepIndex,
                                succeeded: commandExec.success,
                            });
                            logger.verbose(`commandExec ${JSON.stringify(commandExec)}`);

                            if (!commandExec.success) {
                                if (commandExec.data.signal) {
                                    logger.warn(
                                        `Step ${JSON.stringify(compositeStepIndex)} command exited by signal ${commandExec.data.signal}`,
                                    );
                                }
                                const aborted = commandExec.data.reason === 'aborted';
                                if (aborted || !continueOnError) {
                                    stepWalkFailure = {
                                        success: false,
                                        data: {
                                            message: `Failed to run the command: ${commandExec.data.message}. Command: ${executable} ${args.join(' ')}`,
                                            reason: 'stepWalkFailed',
                                        },
                                    };
                                    return;
                                }

                                commandSucceeded = false;
                                commandResult = (
                                    commandExec.data.stdout
                                    || commandExec.data.stderr
                                    || commandExec.data.message
                                    || ''
                                ).toString();
                                logger.verbose(`commandResult ${commandResult}`);
                            } else {
                                commandResult = (commandExec.data.stdout || commandExec.data.stderr || '').toString();
                                logger.verbose(`commandResult ${commandResult}`);
                            }

                            if (commandSucceeded) {
                                const gitStatusAfterCommand = await execAsync(`git status`, { cwd: workspacePath });
                                logger.verbose(`gitStatusCommand ${JSON.stringify(gitStatusAfterCommand.data)}`);
                            }
                        }

                        const historyEntry = {
                            commandResult,
                            commandSucceeded,
                            context,
                            prompt,
                            stepIndex: compositeStepIndex,
                            contextRunState,
                            lumpVariables,
                            stepVariables,
                            projectRoot,
                        };
                        const postCommandExecFnInput = {
                            ...historyEntry,
                            signal,
                        };
                        logger.verbose(`context is ${JSON.stringify(context)}`);
                        const keepHistoryFilePath = getKeepHistoryFilePathFn(context) || '';
                        logger.verbose(`keepHistoryFilePath ${keepHistoryFilePath}`);
                        if (!!command && keepHistoryFilePath.length > 0) {
                            const appendResult = await appendHistoryEntry({
                                filePath: keepHistoryFilePath,
                                entry: historyEntry,
                            });
                            if (!appendResult.success) {
                                // TODO: sanitize history appending to avoid this warning for certain commands outputs
                                logger.warn(
                                    `Failed to append history entry to ${keepHistoryFilePath}: ${appendResult.data}`,
                                );
                            }
                        }

                        if (postCommandExecFn) {
                            const returnedSteps = await awaitUnlessAborted(
                                postCommandExecFn(postCommandExecFnInput),
                                signal,
                            );
                            if (returnedSteps != null && returnedSteps.length > 0) {
                                await walkAndExecuteSteps(returnedSteps, nextCallHeadIndex);
                            }
                        }
                    }
                } catch (error) {
                    if (isStepWalkAbortError(error)) {
                        stepWalkFailure = stepWalkAbortedFailure();
                        return;
                    }
                    throw error;
                }
            }

            try {
                await walkAndExecuteSteps(steps, []);
            } finally {
                try {
                    await teardownFn({
                        lumpVariables,
                        contextList,
                        currentContextIndex: i,
                        contextRunState,
                    });
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    logger.error(`Failed to run teardownFn: ${message}`);
                }
            }

            recordContext();

            if (stepWalkFailure) {
                runFailure = stepWalkFailure;
                break;
            }

            const commitMessage = gitCommitMessageFn({ context, lumpVariables, baseBranch });
            const addCommitExecLabel = `git add+commit for context ${context.name}`;
            const addCommitOutcome = await runGitResultHook({
                getResult: () =>
                    gitAddCommitFn({
                        ...injectedGitAndWorkspaceFnsInput,
                        context,
                        commitMessage,
                    }),
                cwd: workspacePath,
                logger,
                execLabel: addCommitExecLabel,
            });
            if (addCommitOutcome.status === 'failed') {
                const message =
                    `Failed to add and commit for context ${context.name}: ${addCommitOutcome.detail}`;
                logger.error(message);
                runFailure = {
                    success: false,
                    data: {
                        message,
                        reason: 'gitAddCommitFailed',
                    },
                };
                break;
            }
        }

        if (!runFailure) {
            const pushExecLabel = `git push on branch ${branchName}`;
            const pushOutcome = await runGitResultHook({
                getResult: () => gitPushFn(injectedGitAndWorkspaceFnsInput),
                cwd: workspacePath,
                logger,
                execLabel: pushExecLabel,
            });
            if (pushOutcome.status === 'failed') {
                logger.error(`Failed to ${pushExecLabel}: ${pushOutcome.detail}`);
            }
        }
    } finally {
        const teardownWorkspaceCommand = await teardownWorkspaceFn(injectedGitAndWorkspaceFnsInput);

        logger.verbose(`teardownWorkspaceCommand ${teardownWorkspaceCommand}`);

        if (teardownWorkspaceCommand) {
            const teardownWorkspaceCommandExec = await execAsync(teardownWorkspaceCommand, { cwd: workspacePath });
            logger.verbose(`teardownWorkspaceCommandExec ${JSON.stringify(teardownWorkspaceCommandExec)}`);
            if (!teardownWorkspaceCommandExec.success) {
                if (runFailure) {
                    logger.error(formatExecFailureMessage({
                        label: 'teardown workspace',
                        failure: teardownWorkspaceCommandExec,
                    }));
                } else {
                    runFailure = {
                        success: false,
                        data: {
                            message: `Failed to teardown the workspace: ${teardownWorkspaceCommandExec.data.message}`,
                            reason: 'workspaceTeardownFailed',
                        },
                    };
                }
            }
        }
    }

    if (runFailure) {
        return failure({
            ...runFailure.data,
            contextResults: injectedGitAndWorkspaceFnsInput.contextResults,
        });
    }

    return success({
        branchName,
        contextNames,
        contextRunStateList,
        contextResults: injectedGitAndWorkspaceFnsInput.contextResults,
    });
}

export type ExecuteStepsForContextListResult = Awaited<ReturnType<typeof executeStepsForContextList>>;
