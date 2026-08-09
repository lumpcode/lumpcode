import { execBinary } from '../execBinary';
import { execAsync } from '../execAsync';
import { 
    ContextList,  
    ContextRunState,
    ExecuteStepsFailureData,
    Failure,
    Logger,
    LumpVariables,
    Maybe,
    MaybePromise,
    PromptFnInput,
    Step,
    Steps,
    StepVariables,
} from "../../types";
import {
    appendHistoryEntry,
    createConsoleLogger,
    formatExecFailureMessage,
    set,
    success,
} from '../../utils';
import { GitAndWorkspaceFnsInput } from '../../types/GitAndWorkspaceFnsInput';
import type { RunLumpInput } from '../../usages';

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

async function runOptionalGitCommand(input: {
    label: string;
    getCommand: () => MaybePromise<Maybe<string>>;
    cwd: string;
    logger: Logger;
}): Promise<'ok' | 'failed'> {
    const { label, getCommand, cwd, logger } = input;
    try {
        const command = await getCommand();
        if (command == null || command === '') {
            return 'ok';
        }
        const result = await execAsync(command, { cwd });
        logger.verbose(`${label} ${JSON.stringify(result)}`);
        if (!result.success) {
            logger.error(formatExecFailureMessage({ label, failure: result }));
            return 'failed';
        }
        return 'ok';
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to run ${label}: ${message}`);
        return 'failed';
    }
}

export type ExecuteStepsForContextListParams<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = Required<Pick<
    RunLumpInput<V, SV>,
    | 'baseBranch' 
    | 'branchFn'
    | 'lumpVariables'
    | 'steps'
    | 'setupFn'
    | 'teardownFn'
    | 'gitAddCommandFn'
    | 'gitCommitCommandFn'
    | 'gitPushCommandFn'
    | 'gitCommitMessageFn'
    | 'projectRoot'
    | 'setupWorkspaceFn'
    | 'teardownWorkspaceFn'
    | 'getKeepHistoryFilePathFn'
>> & {
    contextList: ContextList;
    logger?: Logger;
    /** When aborted, in-flight commands are killed and the step walk stops (ignores continueOnError). */
    signal?: AbortSignal;
}

export async function executeStepsForContextList<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
>({
    baseBranch,
    branchFn,
    lumpVariables,
    contextList,
    gitAddCommandFn,
    gitCommitCommandFn,
    gitPushCommandFn,
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
            return set(
                setupWorkspaceCommandExec, 
                ['data', 'message'], 
                `Failed to setup the workspace: ${setupWorkspaceCommandExec.data.message}`
            );
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

            let stepWalkFailure: Failure<ExecuteStepsFailureData> | undefined;

            async function walkAndExecuteSteps(
                stepsToExec: Steps<V, SV>,
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

                            const commandExec = await execBinary({
                                binaryPath: executable,
                                args,
                                timeoutMillis,
                                stdio: ['inherit', 'pipe', 'pipe'],
                                cwd: workspacePath,
                                signal,
                                ...(env != null ? { env: { ...process.env, ...env } } : {}),
                            });
                            logger.verbose(`commandExec ${JSON.stringify(commandExec)}`);

                            if (!commandExec.success) {
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

            if (stepWalkFailure) {
                runFailure = stepWalkFailure;
                break;
            }

            const perContextInput = {
                ...injectedGitAndWorkspaceFnsInput,
                context,
            };

            const addOutcome = await runOptionalGitCommand({
                label: `git add for context ${context.name}`,
                getCommand: () => gitAddCommandFn(perContextInput),
                cwd: workspacePath,
                logger,
            });
            if (addOutcome === 'failed') {
                runFailure = {
                    success: false,
                    data: {
                        message: `Failed to add the changes for context ${context.name}`,
                    },
                };
                break;
            }

            const commitMessage = gitCommitMessageFn({ context, lumpVariables, baseBranch });

            await runOptionalGitCommand({
                label: `git commit for context ${context.name}`,
                getCommand: () =>
                    gitCommitCommandFn({
                        ...perContextInput,
                        commitMessage,
                    }),
                cwd: workspacePath,
                logger,
            });
        }

        if (!runFailure) {
            await runOptionalGitCommand({
                label: `git push on branch ${branchName}`,
                getCommand: () => gitPushCommandFn(injectedGitAndWorkspaceFnsInput),
                cwd: workspacePath,
                logger,
            });
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
        return runFailure;
    }

    return success({
        branchName,
        contextNames,
        contextRunStateList,
    });
}

export type ExecuteStepsForContextListResult = Awaited<ReturnType<typeof executeStepsForContextList>>;
