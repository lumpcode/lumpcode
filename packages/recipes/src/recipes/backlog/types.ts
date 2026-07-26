import type { LumpJsConfig, LumpVariables, StepVariables } from '@lumpcode/cli-utils';
import type { MaybePromise } from '@lumpcode/core';
import type { BaseBacklogItem } from '../../types';
import type { BacklogPaths } from '../../kit';

export type BacklogStageDefinition<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = {
    steps: NonNullable<LumpJsConfig<V, SV>['steps']>;
    completion: 'keepPending' | 'moveToDone';
};

export type BacklogItemResolution<StageName extends string> =
    | { ignored: true }
    | {
          stage: StageName;
          contextName?: string;
          /** Context variables (not lump/step variable bags). */
          variables?: LumpVariables;
          additionalDependsOnContexts?: string[];
      };

export type BacklogOptions<
    Item extends BaseBacklogItem,
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
    Stages extends Record<string, BacklogStageDefinition<V, SV>> = Record<
        string,
        BacklogStageDefinition<V, SV>
    >,
> = {
    configUrl: string | URL;
    backlogItemsDir?: string;
    stages: Stages;
    parseItem?: (item: BaseBacklogItem, folderName: string, raw: unknown) => Item;
    resolveItem(input: {
        item: Item;
        paths: BacklogPaths;
    }): MaybePromise<BacklogItemResolution<Extract<keyof Stages, string>>>;
} & Omit<
    LumpJsConfig<V, SV>,
    'contextListJson' | 'contextMatchFn' | 'getContextListFn' | 'prompt' | 'steps'
>;

export const BACKLOG_STAGE_VAR = 'BACKLOG_STAGE';
export const BACKLOG_TASK_NAME_VAR = 'TASK_NAME';
export const BACKLOG_TASK_VAR = 'TASK';
export const BACKLOG_ITEMS_DIR_VAR = 'BACKLOG_ITEMS_DIR';
export const BACKLOG_ITEM_DIR_VAR = 'BACKLOG_ITEM_DIR';
