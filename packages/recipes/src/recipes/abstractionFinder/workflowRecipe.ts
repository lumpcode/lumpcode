import type {
    LumpJsConfig,
    LumpVariables,
    StepVariables,
} from '@lumpcode/cli-utils';
import type { CommandDescriptor, MaybePromise, WorkflowFn, WorkflowInput } from '@lumpcode/core';

import { defineRecipe } from '../../types';

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

export const abstractionFinder = defineRecipe(function abstractionFinder<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
>(_options: AbstractionFinderOptions<V, SV>): LumpJsConfig<V, SV> {
    throw new Error('abstractionFinder workflow is not implemented.');
});
