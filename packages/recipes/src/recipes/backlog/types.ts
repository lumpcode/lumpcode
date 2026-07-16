import type { LumpJsConfig, LumpVariables } from '@lumpcode/cli-utils';
import type { MaybePromise } from '@lumpcode/core';
import type { BaseBacklogItem } from '../../types';

export type BacklogStageDefinition = {
    steps: NonNullable<LumpJsConfig['steps']>;
    completion: 'keepPending' | 'moveToDone';
};

export type BacklogPaths = {
    lumpPath: string;
    lumpName: string;
    backlogFilePath: string;
    doneFilePath: string;
};

export type BacklogItemResolution<StageName extends string> =
    | { ignored: true }
    | {
          stage: StageName;
          contextName?: string;
          variables?: LumpVariables;
          additionalDependsOnContexts?: string[];
      };

export type BacklogOptions<
    Item extends BaseBacklogItem,
    Stages extends Record<string, BacklogStageDefinition>,
> = {
    configUrl: string | URL;
    backlogFilePath?: string;
    doneFilePath?: string;
    stages: Stages;
    parseItem?: (item: BaseBacklogItem, index: number, raw: unknown) => Item;
    resolveItem(input: {
        item: Item;
        paths: BacklogPaths;
    }): MaybePromise<BacklogItemResolution<Extract<keyof Stages, string>>>;
} & Omit<
    LumpJsConfig,
    'contextListJson' | 'contextMatchFn' | 'getContextListFn' | 'prompt' | 'steps'
>;

export const BACKLOG_STAGE_VAR = 'BACKLOG_STAGE';
export const BACKLOG_TASK_NAME_VAR = 'TASK_NAME';
export const BACKLOG_TASK_VAR = 'TASK';
export const BACKLOG_FILE_VAR = 'BACKLOG_FILE';
export const BACKLOG_DONE_FILE_VAR = 'DONE_FILE';
