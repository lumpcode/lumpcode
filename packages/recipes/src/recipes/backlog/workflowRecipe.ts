import {
    defineConfig,
    type LumpJsConfig,
    type LumpVariables,
    type StepVariables,
} from '@lumpcode/cli-utils';
import type { WorkflowFn, WorkflowInput } from '@lumpcode/core';

import { projectRootFromConfigUrl, resolveBacklogPaths, setTaskDone } from '../../kit';
import { defineRecipe, type BaseBacklogItem } from '../../types';
import { backlogGetContextListFn } from './main';
import type { BacklogOptions, BacklogStageDefinition } from './types';
import {
    BACKLOG_ITEMS_DIR_VAR,
    BACKLOG_STAGE_VAR,
} from './types';

async function runStageWorkflow<
    V extends LumpVariables,
    SV extends StepVariables,
    Stages extends Record<string, BacklogStageDefinition<V, SV>>,
>(input: {
    stages: Stages;
    workflowInput: WorkflowInput<V>;
}): Promise<Awaited<ReturnType<WorkflowFn<V, SV>>>> {
    const { stages, workflowInput } = input;
    const stageName = workflowInput.context.variables[BACKLOG_STAGE_VAR];
    if (typeof stageName !== 'string') {
        return { succeeded: true };
    }
    const stageDef = stages[stageName as Extract<keyof Stages, string>];
    if (!stageDef) {
        return { succeeded: true };
    }

    const result = await stageDef.workflow(workflowInput);
    if (stageDef.completion === 'moveToDone') {
        const itemsDir = workflowInput.context.variables[BACKLOG_ITEMS_DIR_VAR];
        if (typeof itemsDir === 'string' && itemsDir.length > 0) {
            await setTaskDone({
                workspacePath: workflowInput.workspacePath,
                context: workflowInput.context,
            });
        }
    }
    return result;
}

export const backlog = defineRecipe(function backlog<
    Item extends BaseBacklogItem,
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
    Stages extends Record<string, BacklogStageDefinition<V, SV>> = Record<
        string,
        BacklogStageDefinition<V, SV>
    >,
>(options: BacklogOptions<Item, V, SV, Stages>): LumpJsConfig<V, SV> {
    const {
        configUrl,
        backlogItemsDir: backlogItemsDirOverride,
        includeUmbrellaParents,
        stages,
        parseItem,
        resolveItem,
        ...rest
    } = options;

    const paths = resolveBacklogPaths(configUrl, {
        backlogItemsDir: backlogItemsDirOverride,
    });
    const projectRoot = projectRootFromConfigUrl(configUrl);

    return defineConfig<V, SV>({
        getContextListFn: backlogGetContextListFn<Item, V, Extract<keyof Stages, string>>({
            projectRoot,
            paths,
            includeUmbrellaParents,
            parseItem,
            resolveItem,
        }),
        workflow: (workflowInput) => runStageWorkflow<V, SV, Stages>({
            stages,
            workflowInput,
        }),
        ...rest,
    });
});
