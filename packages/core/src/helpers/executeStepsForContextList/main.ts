import { execBinary } from '../execBinary';
import { execAsync } from '../execAsync';
import { 
    ContextList,  
    ContextRunState,
    Failure,
    Logger,
    PromptFnInput,
    Step,
    Steps,
} from "../../types";
import {
    appendHistoryEntry,
    createConsoleLogger,
    failure,
    formatExecFailureMessage,
    set,
    success,
} from '../../utils';
import { GitAndWorkspaceFnsInput } from '../../types/GitAndWorkspaceFnsInput';
import type { RunLumpInput } from '../../usages';

export type ExecuteStepsForContextListParams = Required<Pick<
    RunLumpInput,
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
}

export async function executeStepsForContextList({
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
}: ExecuteStepsForContextListParams) {
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

    for (let i = 0; i < contextList.length; i++) {
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

        let stepWalkFailure: Failure<{ message: string }> | undefined;

        async function walkAndExecuteSteps(
            stepsToExec: Steps,
            currStepIndex: number[],
        ): Promise<void> {
            for (let stepIndex = 0; stepIndex < stepsToExec.length; stepIndex++) {
                if (stepWalkFailure) {
                    return;
                }

                const step = stepsToExec[stepIndex];
                const nextCallHeadIndex = [...currStepIndex, stepIndex];
                const compositeStepIndex: number | number[] =
                    nextCallHeadIndex.length === 1 ? nextCallHeadIndex[0]! : nextCallHeadIndex;

                if (typeof step === 'function' || Array.isArray(step)) {
                    let subSteps: Steps = [];
                    if (typeof step === 'function') {
                        subSteps = await step({
                            context,
                            stepIndex: compositeStepIndex,
                            contextRunState,
                            lumpVariables,
                        });
                    } else {
                        subSteps = step;
                    }
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
                } = step as Step;

                const prompt = promptFn
                    ? await promptFn({
                        context,
                        stepIndex: compositeStepIndex,
                        contextRunState,
                        lumpVariables,
                        stepVariables,
                    } satisfies PromptFnInput)
                    : '';

                const command = await commandFn({
                    context,
                    prompt,
                    stepIndex: compositeStepIndex,
                    contextRunState,
                    lumpVariables,
                    stepVariables,
                    projectRoot,
                    workspacePath,
                });

                let commandResult = '';
                let commandSucceeded = true;

                if (command != null) {
                    const { executable, args, env } = command;

                    logger.verbose(`command for prompt ${executable} ${args.join(' ')}`);
                    if (env != null) {
                        logger.verbose(`command env overrides ${JSON.stringify(env)}`);
                    }
                    logger.verbose(`workspacePath ${workspacePath}`);

                    const commandExec = await execBinary(
                        executable,
                        args,
                        timeoutMillis,
                        {
                            stdio: ['inherit', 'pipe', 'pipe'],
                            cwd: workspacePath,
                            ...(env != null ? { env: { ...process.env, ...env } } : {}),
                        }
                    );
                    logger.verbose(`commandExec ${JSON.stringify(commandExec)}`);

                    if (!commandExec.success) {
                        if (!continueOnError) {
                            stepWalkFailure = set(
                                commandExec,
                                ['data', 'message'],
                                `Failed to run the command: ${commandExec.data.message}. Command: ${executable} ${args.join(' ')}`
                            );
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

                const postCommandExecFnInput = {
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
                logger.verbose(`context is ${JSON.stringify(context)}`);
                const keepHistoryFilePath = getKeepHistoryFilePathFn(context) || '';
                logger.verbose(`keepHistoryFilePath ${keepHistoryFilePath}`);
                if (!!command && keepHistoryFilePath.length > 0) {
                    const appendResult = await appendHistoryEntry({
                        filePath: keepHistoryFilePath,
                        entry: postCommandExecFnInput,
                    });
                    if (!appendResult.success) {
                        stepWalkFailure = failure({ message: appendResult.data });
                        return;
                    }
                }

                if (postCommandExecFn) {
                    await postCommandExecFn(postCommandExecFnInput);
                }
            }
        }

        await walkAndExecuteSteps(steps, []);

        if (stepWalkFailure) {
            return stepWalkFailure;
        }

        await teardownFn({
            lumpVariables,
            contextList,
            currentContextIndex: i,
            contextRunState,
        });

        const perContextInput = {
            ...injectedGitAndWorkspaceFnsInput,
            context,
        };

        const gitAddCommand = await execAsync(gitAddCommandFn(perContextInput), { cwd: workspacePath });

        logger.verbose(`gitAddCommand ${JSON.stringify(gitAddCommand)}`);

        if (!gitAddCommand.success) {
            return set(
                gitAddCommand,
                ['data', 'message'],
                `Failed to add the changes for context ${context.name}: ${gitAddCommand.data.message}`
            );
        }

        const commitMessage = gitCommitMessageFn({ context, lumpVariables, baseBranch });

        const commitCommand = await execAsync(gitCommitCommandFn({
            ...perContextInput,
            commitMessage,
        }), { cwd: workspacePath });

        logger.verbose(`commitCommand ${JSON.stringify(commitCommand)}`);

        if (!commitCommand.success) {
            logger.error(formatExecFailureMessage({
                label: `git commit for context ${context.name}`,
                failure: commitCommand,
            }));
        }
    }

    const pushCommand = await execAsync(gitPushCommandFn(injectedGitAndWorkspaceFnsInput), { cwd: workspacePath });

    logger.verbose(`pushCommand ${JSON.stringify(pushCommand)}`);

    if (!pushCommand.success) {
        logger.error(formatExecFailureMessage({
            label: `git push on branch ${branchName}`,
            failure: pushCommand,
        }));
    }   

    const teardownWorkspaceCommand = await teardownWorkspaceFn(injectedGitAndWorkspaceFnsInput);

    logger.verbose(`teardownWorkspaceCommand ${teardownWorkspaceCommand}`);

    if (teardownWorkspaceCommand) {
        const teardownWorkspaceCommandExec = await execAsync(teardownWorkspaceCommand, { cwd: workspacePath });
        logger.verbose(`teardownWorkspaceCommandExec ${JSON.stringify(teardownWorkspaceCommandExec)}`);
        if (!teardownWorkspaceCommandExec.success) {
            return set(
                teardownWorkspaceCommandExec, 
                ['data', 'message'], 
                `Failed to teardown the workspace: ${teardownWorkspaceCommandExec.data.message}`
            );
        }
    }

    return success({
        branchName,
        contextNames,
        contextRunStateList,
    });
}

export type ExecuteStepsForContextListResult = Awaited<ReturnType<typeof executeStepsForContextList>>;
