import type {
    Context,
    LumpJsConfig,
    LumpVariables,
    StepVariables,
} from '@lumpcode/cli-utils';
import type { CommandDescriptor, MaybePromise, WorkflowFn, WorkflowInput } from '@lumpcode/core';

import { projectRootFromConfigUrl, retryUntilGreen } from '../../kit';
import { defineRecipe, type BaseBacklogItem } from '../../types';
import { backlog } from '../backlog';
import {
    abstractionImplementationPrompt,
    resolveAbstractionBacklogItem,
} from './main';

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

const DEFAULT_MAX_ATTEMPTS = 3;

async function resolveCheck<V extends LumpVariables>(
    command: AbstractionBacklogValidateCommand<V> | undefined,
    workflowInput: WorkflowInput<V>,
): Promise<string | CommandDescriptor | null> {
    if (command === undefined) {
        return null;
    }
    if (typeof command === 'function') {
        return command({
            context: workflowInput.context,
            lumpVariables: workflowInput.lumpVariables,
        });
    }
    return command;
}

function defaultImplementationWorkflow<V extends LumpVariables, SV extends StepVariables>(
    implValidateCommand: AbstractionBacklogValidateCommand<V> | undefined,
): WorkflowFn<V, SV> {
    return async (workflowInput) => {
        const session = await workflowInput.agent.session();
        await session.prompt(abstractionImplementationPrompt(workflowInput.context));
        const check = await resolveCheck(implValidateCommand, workflowInput);
        if (check == null) {
            return { succeeded: true, message: 'Checks passed.' };
        }
        const loop = await retryUntilGreen({
            session,
            shell: workflowInput.shell,
            check,
            maxAttempts: DEFAULT_MAX_ATTEMPTS,
        });
        if (loop.succeeded) {
            return { succeeded: true, message: 'Checks passed.' };
        }
        return {
            succeeded: false,
            message: `Tests still red after ${DEFAULT_MAX_ATTEMPTS} attempts.`,
        };
    };
}

export const abstractionBacklog = defineRecipe(function abstractionBacklog<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
>(options: AbstractionBacklogOptions<V, SV>): LumpJsConfig<V, SV> {
    const {
        implValidateCommand,
        configUrl,
        workflow: workflowOverride,
        ...rest
    } = options;
    const projectRoot = projectRootFromConfigUrl(configUrl);
    const stageWorkflow = workflowOverride ?? defaultImplementationWorkflow<V, SV>(implValidateCommand);

    return backlog<BaseBacklogItem, V, SV>({
        configUrl,
        resolveItem: ({ item, paths }) => resolveAbstractionBacklogItem({
            item,
            paths,
            projectRoot,
        }),
        stages: {
            implementation: {
                completion: 'moveToDone',
                workflow: stageWorkflow,
            },
        },
        ...rest,
    });
});
