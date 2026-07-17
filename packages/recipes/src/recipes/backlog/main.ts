import path from 'node:path';

import { defineConfig, normalizeSteps, type Context, type LumpJsConfig, type LumpJsConfigSteps } from '@lumpcode/cli-utils';

import {
    folderBacklogContexts,
    folderSetTaskDoneStep,
    projectRootFromConfigUrl,
    resolveBacklogPaths,
} from '../../kit';
import { BaseBacklogItem, defineRecipe, type Recipe } from '../../types';

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

function buildStageSteps<Stages extends Record<string, BacklogStageDefinition>>(
    stages: Stages,
    stageName: Extract<keyof Stages, string>,
): LumpJsConfigSteps {
    const stageDef = stages[stageName];
    if (!stageDef) {
        return [];
    }

    const normalized = normalizeSteps({
        prompt: undefined,
        jsSteps: stageDef.steps,
    });

    if (stageDef.completion === 'moveToDone') {
        return [
            ...normalized,
            folderSetTaskDoneStep({
                itemsDirVarName: BACKLOG_ITEMS_DIR_VAR,
            }),
        ];
    }

    return normalized;
}

export function backlog<
    Item extends BaseBacklogItem,
    Stages extends Record<string, BacklogStageDefinition>,
>(options: BacklogOptions<Item, Stages>): LumpJsConfig {
    const {
        configUrl,
        backlogItemsDir: backlogItemsDirOverride,
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

    return defineConfig({
        getContextListFn: folderBacklogContexts<Item>({
            backlogItemsDir: absoluteBacklogItemsDir,
            parseItem,
            async parseContext(item, folderName) {
                const resolution = await resolveItem({ item, paths });

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
                            dependsOnContexts: dependsOnContexts.length > 0 ? dependsOnContexts : undefined,
                        },
                    },
                };
            },
        }),
        steps: [
            ({ context }) => {
                const ctx = context as Context;
                const stageName = ctx.variables[BACKLOG_STAGE_VAR];
                if (typeof stageName !== 'string') {
                    return [];
                }
                return buildStageSteps(stages, stageName as Extract<keyof Stages, string>);
            },
        ],
        ...rest,
    });
}

export const backlogRecipe: Recipe<
    BacklogOptions<BaseBacklogItem, Record<string, BacklogStageDefinition>>
> = defineRecipe((options) => backlog(options));
