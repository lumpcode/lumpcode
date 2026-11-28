import type { LumpJsConfig, LumpVariables, StepVariables } from '@lumpcode/cli-utils';
import type { MaybePromise, WorkflowFn } from '@lumpcode/core';
import type { BaseBacklogItem } from '../../types';
import type { BacklogPaths } from '../../kit';

export type BacklogStageStepsDefinition<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = {
    steps: NonNullable<LumpJsConfig<V, SV>['steps']>;
    completion: 'keepPending' | 'moveToDone';
};

export type BacklogStageDefinition<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = {
    workflow: WorkflowFn<V, SV>;
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

type BacklogOptionsBase<
    Item extends BaseBacklogItem,
    V extends LumpVariables,
    SV extends StepVariables,
    Stages extends Record<string, { completion: 'keepPending' | 'moveToDone' }>,
> = {
    configUrl: string | URL;
    backlogItemsDir?: string;
    /** When true, umbrella parents with tickets are emitted for wrap-up (featureBacklog). */
    includeUmbrellaParents?: boolean;
    stages: Stages;
    parseItem?: (item: BaseBacklogItem, folderName: string, raw: unknown) => Item;
    resolveItem(input: {
        item: Item;
        paths: BacklogPaths;
        /** Concrete scan/discovery branch for this context-list invocation. */
        discoveryBranch: string;
    }): MaybePromise<BacklogItemResolution<Extract<keyof Stages, string>>>;
};

export type BacklogStepsOptions<
    Item extends BaseBacklogItem,
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
    Stages extends Record<string, BacklogStageStepsDefinition<V, SV>> = Record<
        string,
        BacklogStageStepsDefinition<V, SV>
    >,
> = BacklogOptionsBase<Item, V, SV, Stages> & Omit<
    LumpJsConfig<V, SV>,
    'contextListJson' | 'contextMatchFn' | 'getContextListFn' | 'prompt' | 'steps'
>;

export type BacklogOptions<
    Item extends BaseBacklogItem,
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
    Stages extends Record<string, BacklogStageDefinition<V, SV>> = Record<
        string,
        BacklogStageDefinition<V, SV>
    >,
> = BacklogOptionsBase<Item, V, SV, Stages> & Omit<
    LumpJsConfig<V, SV>,
    'contextListJson' | 'contextMatchFn' | 'getContextListFn' | 'prompt' | 'steps' | 'workflow'
>;

export const BACKLOG_STAGE_VAR = 'BACKLOG_STAGE';
export const BACKLOG_TASK_NAME_VAR = 'TASK_NAME';
export const BACKLOG_TASK_VAR = 'TASK';
export const BACKLOG_ITEMS_DIR_VAR = 'BACKLOG_ITEMS_DIR';
export const BACKLOG_ITEM_DIR_VAR = 'BACKLOG_ITEM_DIR';
