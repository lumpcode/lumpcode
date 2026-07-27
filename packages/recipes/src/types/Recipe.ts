import type { LumpJsConfig, LumpVariables, StepVariables } from '@lumpcode/cli-utils';

export type Recipe<
    Options,
    V extends LumpVariables = LumpVariables,
    SV extends StepVariables = StepVariables,
> = (options: Options) => LumpJsConfig<V, SV>;

/** Identity helper — must preserve a generic `<V, SV>` function signature. */
export function defineRecipe<R extends (options: never) => LumpJsConfig>(
    recipe: R,
): R {
    return recipe;
}
