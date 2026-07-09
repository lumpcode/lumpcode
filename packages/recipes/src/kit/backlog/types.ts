export type BaseBacklogItem = {
    name: string;
    task: string;
    priority: number;
    dependsOn?: string[];
};

export type BacklogItem = BaseBacklogItem & {
    type: 'feature' | 'documentation' | 'misc';
};

/** Abstraction backlog items omit `type`. */
export type AbstractionBacklogItem = BaseBacklogItem;

export type DoneBacklogItem<T extends BaseBacklogItem = BacklogItem> = T & { completedAt: string };

export type FeatureFlow = 'prd' | 'testPlan' | 'tests_impl' | 'impl';

export type BacklogContextVariables = {
    TYPE: 'feature' | 'documentation' | 'misc';
    TASK_NAME: string;
    TASK: string;
    NEXT_FLOW?: FeatureFlow;
    BACKLOG_FILE: string;
    DONE_FILE: string;
    PRD_FILE?: string;
    TEST_PLAN_FILE?: string;
};

export type AbstractionBacklogContextVariables = {
    TASK_NAME: string;
    TASK: string;
    BACKLOG_FILE: string;
    DONE_FILE: string;
    NEXT_FLOW?: 'impl';
    PRD_FILE?: string;
};

export type BacklogPhaseMode = 'full' | 'prd-impl-only';

export type BacklogItemMode = 'typed' | 'abstraction';
