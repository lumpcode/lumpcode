export interface Context {
    variables: Record<string, string>;
    name: string;
    options?: {
        priority?: number;
        dependsOnContexts?: string[];
    };
}