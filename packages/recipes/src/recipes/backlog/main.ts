import path from 'node:path';

import {
    defineConfig,
    normalizeSteps,
    type Context,
    type LumpJsConfig,
    type LumpJsConfigSteps,
    type LumpVariables,
    type StepVariables,
} from '@lumpcode/cli-utils';

import {
    folderBacklogContexts,
    folderSetTaskDoneStep,
    projectRootFromConfigUrl,
    resolveBacklogPaths,
} from '../../kit';
import { BaseBacklogItem, defineRecipe } from '../../types';

import type {
    BacklogItemResolution,
    BacklogOptions,
    BacklogStageDefinition,
} from './types';
import {
    BACKLOG_ITEM_DIR_VAR,
    BACKLOG_ITEMS_DIR_VAR,
    BACKLOG_STAGE_VAR,
    BACKLOG_TASK_NAME_VAR,
    BACKLOG_TASK_VAR,
} from './types';

export type { BacklogOptions, BacklogStageDefinition, BacklogItemResolution } from './types';
export {
    BACKLOG_ITEM_DIR_VAR,
    BACKLOG_ITEMS_DIR_VAR,
    BACKLOG_STAGE_VAR,
    BACKLOG_TASK_NAME_VAR,
    BACKLOG_TASK_VAR,
} from './types';

function isIgnoredResolution<StageName extends string>(
    resolution: BacklogItemResolution<StageName>,
): resolution is { ignored: true } {
    return 'ignored' in resolution && resolution.ignored === true;
}

function buildStageSteps<
    V extends LumpVariables,
    SV extends StepVariables,
    Stages extends Record<string, BacklogStageDefinition<V, SV>>,
>(
    stages: Stages,
    stageName: Extract<keyof Stages, string>,
): LumpJsConfigSteps<V, SV> {
    const stageDef = stages[stageName];
    if (!stageDef) {
        return [];
    }

    const normalized = normalizeSteps<V, SV>({
        prompt: undefined,
        jsSteps: stageDef.steps,
    });

    if (stageDef.completion === 'moveToDone') {
        return [
            ...normalized,
            folderSetTaskDoneStep<V, SV>({
                itemsDirVarName: BACKLOG_ITEMS_DIR_VAR,
            }),
        ];
    }

    return normalized;
}

export function backlog<
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
    const absoluteBacklogItemsDir = path.join(projectRoot, paths.backlogItemsDir);

    return defineConfig<V, SV>({
        getContextListFn: async (input) => {
            const listFn = folderBacklogContexts<Item, V>({
                backlogItemsDir: absoluteBacklogItemsDir,
                includeUmbrellaParents,
                parseItem,
                async parseContext(item, folderName) {
                    const resolution = await resolveItem({
                        item,
                        paths,
                        discoveryBranch: input.discoveryBranch,
                    });

                    if (isIgnoredResolution(resolution)) {
                        return { ignored: true };
                    }

                    const {
                        stage,
                        contextName,
                        variables,
                        additionalDependsOnContexts,
                    } = resolution;

                    const dependsOnContexts = [
                        ...(item.dependsOn ?? []),
                        ...(additionalDependsOnContexts ?? []),
                    ];

                    const backlogItemDir = path.join(
                        paths.backlogItemsDir,
                        'todo',
                        folderName,
                    );

                    return {
                        parsed: {
                            name: contextName ?? item.name,
                            variables: {
                                [BACKLOG_TASK_NAME_VAR]: item.name,
                                [BACKLOG_TASK_VAR]: item.task,
                                [BACKLOG_ITEMS_DIR_VAR]: paths.backlogItemsDir,
                                [BACKLOG_ITEM_DIR_VAR]: backlogItemDir,
                                [BACKLOG_STAGE_VAR]: stage,
                                ...variables,
                            },
                            options: {
                                priority: item.priority,
                                dependsOnContexts:
                                    dependsOnContexts.length > 0 ? dependsOnContexts : undefined,
                            },
                        },
                    };
                },
            });
            return listFn(input);
        },
        steps: [
            ({ context }) => {
                const ctx = context as Context;
                const stageName = ctx.variables[BACKLOG_STAGE_VAR];
                if (typeof stageName !== 'string') {
                    return [];
                }
                return buildStageSteps<V, SV, Stages>(
                    stages,
                    stageName as Extract<keyof Stages, string>,
                );
            },
        ],
        ...rest,
    });
}

export const backlogRecipe = defineRecipe(backlog);
