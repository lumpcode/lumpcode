import path from 'node:path';

import {
    defineConfig,
    normalizeSteps,
    type Context,
    type GetContextListFn,
    type LumpJsConfig,
    type LumpJsConfigSteps,
    type LumpVariables,
    type StepVariables,
} from '@lumpcode/cli-utils';
import type { MaybePromise } from '@lumpcode/core';

import {
    folderBacklogContexts,
    folderSetTaskDoneStep,
    projectRootFromConfigUrl,
    resolveBacklogPaths,
    type BacklogPaths,
} from '../../kit';
import { BaseBacklogItem, defineRecipe } from '../../types';

import type {
    BacklogItemResolution,
    BacklogStageStepsDefinition,
    BacklogStepsOptions,
} from './types';
import {
    BACKLOG_ITEM_DIR_VAR,
    BACKLOG_ITEMS_DIR_VAR,
    BACKLOG_STAGE_VAR,
    BACKLOG_TASK_NAME_VAR,
    BACKLOG_TASK_VAR,
} from './types';

export type {
    BacklogItemResolution,
    BacklogOptions,
    BacklogStageDefinition,
    BacklogStageStepsDefinition,
    BacklogStepsOptions,
} from './types';
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
    Stages extends Record<string, BacklogStageStepsDefinition<V, SV>>,
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

export function backlogGetContextListFn<
    Item extends BaseBacklogItem,
    V extends LumpVariables = LumpVariables,
    StageName extends string = string,
>(options: {
    projectRoot: string;
    paths: BacklogPaths;
    includeUmbrellaParents?: boolean;
    parseItem?: (item: BaseBacklogItem, folderName: string, raw: unknown) => Item;
    resolveItem(input: {
        item: Item;
        paths: BacklogPaths;
        discoveryBranch: string;
    }): MaybePromise<BacklogItemResolution<StageName>>;
}): GetContextListFn<V> {
    const { projectRoot, paths, includeUmbrellaParents, parseItem, resolveItem } = options;
    const absoluteBacklogItemsDir = path.join(projectRoot, paths.backlogItemsDir);

    return async (input) => {
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
    };
}

export function backlogSteps<
    Item extends BaseBacklogItem,
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
    Stages extends Record<string, BacklogStageStepsDefinition<V, SV>> = Record<
        string,
        BacklogStageStepsDefinition<V, SV>
    >,
>(options: BacklogStepsOptions<Item, V, SV, Stages>): LumpJsConfig<V, SV> {
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

export const backlogRecipe = defineRecipe(backlogSteps);
