export interface Context<Variables extends Record<string, string | number | boolean> = Record<string, string | number | boolean>> {
    variables: Variables;
    name: string;
    options?: {
        priority?: number;
        dependsOnContexts?: string[];
    };
}