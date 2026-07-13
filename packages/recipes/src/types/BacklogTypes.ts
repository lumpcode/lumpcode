export type BaseBacklogItem = {
    name: string;
    task: string;
    priority: number;
    dependsOn?: string[];
};

export type DoneBacklogItem<T extends BaseBacklogItem = BaseBacklogItem> = T & {
    completedAt: string;
};
