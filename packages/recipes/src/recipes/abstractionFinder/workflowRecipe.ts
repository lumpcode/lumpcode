import {
    defineConfig,
    type LumpJsConfig,
    type LumpVariables,
    type StepVariables,
} from '@lumpcode/cli-utils';
import type { CommandDescriptor, MaybePromise, WorkflowFn, WorkflowInput } from '@lumpcode/core';

import { projectRootFromConfigUrl } from '../../kit';
import { defineRecipe } from '../../types';
import {
    abstractionFinderContextList,
    assertProjectRelativeBacklogItemsDir,
    buildFinderPrompt,
} from './main';

/** A scan command the workflow runs through `shell` before the prompt. */
export type AbstractionFinderScanWorkflowCommand<V extends LumpVariables = LumpVariables> =
    | string
    | CommandDescriptor
    | ((input: WorkflowInput<V>) => MaybePromise<string | CommandDescriptor | null | undefined>);

export type AbstractionFinderOptions<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = {
    /** Lump config module URL — pass `import.meta.url` from `config.ts`. */
    configUrl: string | URL;
    scanDirectories?: string[];
    /** Optional util output directory (project-root-relative). Defaults to the first scan directory. */
    utilDir?: string;
    customPrompt?(): string;
    /** Max unmerged items under `backlogItemsDir/todo/`. Finder emits one context per tick while under the cap. */
    maxPendingAbstractions?: number;
    backlogItemsDir: string;
    /** Optional scanner command run before the prompt. */
    scanCommand?: AbstractionFinderScanWorkflowCommand<V>;
    /**
     * Replaces the default prompt workflow.
     * `scanCommand` still runs first when it is set.
     */
    workflow?: WorkflowFn<V, SV>;
} & Omit<
    LumpJsConfig<V, SV>,
    'contextListJson' | 'contextMatchFn' | 'getContextListFn' | 'prompt' | 'steps' | 'workflow'
>;

async function runScan<V extends LumpVariables>(input: {
    scanCommand: AbstractionFinderScanWorkflowCommand<V> | undefined;
    workflowInput: WorkflowInput<V>;
}): Promise<void> {
    const { scanCommand, workflowInput } = input;
    if (scanCommand === undefined) {
        return;
    }
    const command = typeof scanCommand === 'function'
        ? await scanCommand(workflowInput)
        : scanCommand;
    if (command == null) {
        return;
    }
    await workflowInput.shell(command);
}

export const abstractionFinder = defineRecipe(function abstractionFinder<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
>(options: AbstractionFinderOptions<V, SV>): LumpJsConfig<V, SV> {
    const {
        configUrl,
        maxPendingAbstractions = 5,
        scanDirectories,
        utilDir,
        customPrompt,
        backlogItemsDir,
        scanCommand,
        workflow: workflowOverride,
        ...rest
    } = options;

    assertProjectRelativeBacklogItemsDir(backlogItemsDir);
    const projectRoot = projectRootFromConfigUrl(configUrl);
    const prompt = buildFinderPrompt({
        backlogItemsDir,
        scanDirectories,
        utilDir,
        customPrompt,
    });

    return defineConfig<V, SV>({
        ...rest,
        getContextListFn: abstractionFinderContextList<V>({
            projectRoot,
            backlogItemsDir,
            maxPendingAbstractions,
        }),
        workflow: async (workflowInput) => {
            await runScan({ scanCommand, workflowInput });
            if (workflowOverride) {
                return workflowOverride(workflowInput);
            }
            const session = await workflowInput.agent.session();
            await session.prompt(prompt);
            return { succeeded: true };
        },
    });
});
