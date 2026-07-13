import path from 'node:path';

import { defineConfig, normalizeSteps, type Context, type LumpJsConfig, type LumpJsConfigSteps } from '@lumpcode/cli-utils';

import {
    projectRootFromConfigUrl,
    resolveBacklogPaths,
    setTaskDoneStep,
    ymlBacklogContexts,
} from '../../kit';
import { BaseBacklogItem, defineRecipe, type Recipe } from '../../types';

import type {
    BacklogItemResolution,
    BacklogOptions,
    BacklogStageDefinition,
} from './types';
import {
    BACKLOG_DONE_FILE_VAR,
    BACKLOG_FILE_VAR,
    BACKLOG_STAGE_VAR,
    BACKLOG_TASK_NAME_VAR,
    BACKLOG_TASK_VAR,
} from './types';

export type { BacklogOptions, BacklogStageDefinition, BacklogItemResolution } from './types';
export {
    BACKLOG_DONE_FILE_VAR,
    BACKLOG_FILE_VAR,
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
            setTaskDoneStep({
                backlogVarName: BACKLOG_FILE_VAR,
                doneVarName: BACKLOG_DONE_FILE_VAR,
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
        backlogFilePath: backlogFilePathOverride,
        doneFilePath: doneFilePathOverride,
        stages,
        parseItem,
        resolveItem,
        ...rest
    } = options;

    const paths = resolveBacklogPaths(configUrl, {
        backlogFilePath: backlogFilePathOverride,
        doneFilePath: doneFilePathOverride,
    });

    const projectRoot = projectRootFromConfigUrl(configUrl);
    const absoluteBacklogPath = path.join(projectRoot, paths.backlogFilePath);

    return defineConfig({
        getContextListFn: ymlBacklogContexts<Item>({
            backlogFilePath: absoluteBacklogPath,
            parseItem,
            async parseContext(item) {
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

                return {
                    parsed: {
                        name: contextName ?? item.name,
                        variables: {
                            [BACKLOG_TASK_NAME_VAR]: item.name,
                            [BACKLOG_TASK_VAR]: item.task,
                            [BACKLOG_FILE_VAR]: paths.backlogFilePath,
                            [BACKLOG_DONE_FILE_VAR]: paths.doneFilePath,
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
