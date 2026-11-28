import type {
    Context,
    LumpJsConfig,
    LumpVariables,
    StepVariables,
} from '@lumpcode/cli-utils';
import type { CommandDescriptor, MaybePromise, WorkflowFn } from '@lumpcode/core';

import { defineRecipe } from '../../types';

export type AbstractionBacklogValidateCommand<V extends LumpVariables = LumpVariables> =
    | string
    | CommandDescriptor
    | ((input: { context: Context; lumpVariables: V }) => MaybePromise<string | CommandDescriptor | null>);

export type AbstractionBacklogOptions<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = {
    implValidateCommand?: AbstractionBacklogValidateCommand<V>;
    /** Lump config module URL — pass `import.meta.url` from `config.ts`. */
    configUrl: string | URL;
    /**
     * Replaces the default implement workflow.
     * When omitted, the recipe prompts, then runs `implValidateCommand` when it is set.
     */
    workflow?: WorkflowFn<V, SV>;
} & Omit<
    LumpJsConfig<V, SV>,
    'contextListJson' | 'contextMatchFn' | 'getContextListFn' | 'prompt' | 'steps' | 'workflow'
>;

export const abstractionBacklog = defineRecipe(function abstractionBacklog<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
>(_options: AbstractionBacklogOptions<V, SV>): LumpJsConfig<V, SV> {
    throw new Error('abstractionBacklog workflow is not implemented.');
});
