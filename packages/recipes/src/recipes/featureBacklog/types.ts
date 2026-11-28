import type {
    Context,
    LumpJsConfig,
    LumpVariables,
    PromptFn,
    StepVariables,
} from '@lumpcode/cli-utils';
import type { CommandDescriptor, MaybePromise } from '@lumpcode/core';

import type { ValidationCommandFn } from '../../kit';
import type { BaseBacklogItem } from '../../types';

/** `manualReq` is a wait-for-requirements.md gate, not a runnable agent stage. */
export const FEATURE_BACKLOG_WORKFLOW_STAGES = [
    'req',
    'manualReq',
    'testPlan',
    'testImpl',
    'impl',
    'directImpl',
] as const;

export type FeatureBacklogWorkflowStage =
    (typeof FEATURE_BACKLOG_WORKFLOW_STAGES)[number];

export type FeatureBacklogWorkflow = readonly FeatureBacklogWorkflowStage[];

export type FeatureBacklogTerminalStage = 'impl' | 'directImpl';

export const DEFAULT_FEATURE_BACKLOG_WORKFLOW = [
    'manualReq',
    'testImpl',
    'impl',
] as const satisfies FeatureBacklogWorkflow;

export const DEFAULT_PRIMARY_DISCOVERY_BRANCH = 'dev';
export const DEFAULT_ITEM_DISCOVERY_BRANCH_PREFIX = 'feature';

export const FEATURE_BACKLOG_RESERVED_NAME_SUFFIXES = [
    '_req',
    '_testPlan',
    '_testImpl',
] as const;

export const WORKFLOW_PREFIX_ORDER = ['req', 'manualReq', 'testPlan', 'testImpl'] as const;

export type FeatureBacklogItem = BaseBacklogItem & {
    workflow?: FeatureBacklogWorkflow;
    manual?: boolean;
    completedAt?: string;
    /** Path relative to `backlogItems/todo/`; tickets live at `<parent>/tickets/<name>`. */
    todoRelativeDir: string;
    /** Parent todo folder name when this item is a ticket. */
    parentName?: string;
};

export type FeatureBacklogStage =
    | 'req'
    | 'testPlan'
    | 'testImpl'
    | 'impl'
    | 'directImpl'
    | 'completion';

export type FeatureBacklogContextVariables = {
    TASK_NAME: string;
    TASK: string;
    BACKLOG_ITEMS_DIR: string;
    BACKLOG_ITEM_DIR: string;
    BACKLOG_STAGE: FeatureBacklogStage;
    /** Same comma-joined stage list as `STAGES`. Still set while the desc.yml alias exists. */
    WORKFLOW?: string;
    /** Comma-joined stage list from `desc.yml` `stages` (or its deprecated `workflow` alias). */
    STAGES?: string;
    REQ_FILE?: string;
    TEST_PLAN_FILE?: string;
};

export type FeatureBacklogPromptStage = Exclude<FeatureBacklogStage, 'completion'>;

export type FeatureBacklogStepsPromptFns<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = {
    [K in FeatureBacklogPromptStage]?: PromptFn<V, SV>;
};

export type FeatureBacklogStepsOptions<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = {
    configUrl: string | URL;
    implValidateCommand?: ValidationCommandFn<V, SV> | string;
    backlogItemsDir?: string;
    primaryDiscoveryBranch?: string;
    itemDiscoveryBranchPrefix?: string;
    promptFns?: FeatureBacklogStepsPromptFns<V, SV>;
} & Omit<
    LumpJsConfig<V, SV>,
    | 'contextListJson'
    | 'contextMatchFn'
    | 'getContextListFn'
    | 'prompt'
    | 'steps'
    | 'discoveryBranch'
    | 'discoveryBranches'
>;

export type FeatureBacklogPromptInput<V extends LumpVariables = LumpVariables> = {
    context: Context;
    lumpVariables: V;
};

export type FeatureBacklogPrompts<V extends LumpVariables = LumpVariables> = {
    [K in FeatureBacklogPromptStage]?:
        | string
        | ((input: FeatureBacklogPromptInput<V>) => MaybePromise<string>);
};

export type FeatureBacklogValidateCommand<V extends LumpVariables = LumpVariables> =
    | string
    | CommandDescriptor
    | ((input: FeatureBacklogPromptInput<V>) => MaybePromise<string | CommandDescriptor | null>);

export type FeatureBacklogOptions<
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = {
    configUrl: string | URL;
    implValidateCommand?: FeatureBacklogValidateCommand<V>;
    /** Passed to `retryUntilGreen`. Fix attempts after the first check. Default 3. */
    maxAttempts?: number;
    backlogItemsDir?: string;
    primaryDiscoveryBranch?: string;
    itemDiscoveryBranchPrefix?: string;
    prompts?: FeatureBacklogPrompts<V>;
} & Omit<
    LumpJsConfig<V, SV>,
    | 'contextListJson'
    | 'contextMatchFn'
    | 'getContextListFn'
    | 'prompt'
    | 'steps'
    | 'workflow'
    | 'discoveryBranch'
    | 'discoveryBranches'
>;
