import type {
    CommandDescriptor,
    Context,
    ContextList,
    ContextRunState,
    LumpVariables,
    PostCommandExecFn,
    PromptFnInput,
    Step,
    Steps,
    SetupFn,
} from '../../types';

export type CollectedStep = {
    stepIndex: number | number[];
    prompt?: string;
    command: CommandDescriptor | null;
    postCommandExecFn?: PostCommandExecFn;
    stepVariables?: Step['stepVariables'];
    timeoutMillis?: number;
};

export type CollectStepsForContextParams = {
    context: Context;
    contextList: ContextList;
    currentContextIndex: number;
    lumpVariables: LumpVariables;
    steps: Steps;
    setupFn: SetupFn;
    projectRoot: string;
    workspacePath: string;
};

export async function collectStepsForContext(
    params: CollectStepsForContextParams,
): Promise<CollectedStep[]> {
    const {
        context,
        contextList,
        currentContextIndex,
        lumpVariables,
        steps: stepsToCollect,
        setupFn,
        projectRoot,
        workspacePath,
    } = params;

    const setupResult = await setupFn({
        contextList,
        lumpVariables,
        currentContextIndex,
    });

    const contextRunState: ContextRunState = setupResult?.contextRunState ?? {};
    const collectedSteps: CollectedStep[] = [];

    async function walk(stepsToExec: Steps, currStepIndex: number[]): Promise<void> {
        for (let stepIndex = 0; stepIndex < stepsToExec.length; stepIndex++) {
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
                await walk(subSteps, nextCallHeadIndex);
                continue;
            }

            const {
                commandFn = () => null,
                stepVariables,
                promptFn,
                postCommandExecFn,
                timeoutMillis,
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

            collectedSteps.push({
                stepIndex: compositeStepIndex,
                ...(prompt.length > 0 && { prompt }),
                command: command != null
                    ? {
                        executable: command.executable,
                        args: command.args,
                        ...(command.env != null ? { env: command.env } : {}),
                    }
                    : null,
                postCommandExecFn,
                stepVariables,
                timeoutMillis,
            });
        }
    }

    await walk(stepsToCollect, []);
    return collectedSteps;
}
