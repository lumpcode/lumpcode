import type { LumpJsConfig, LumpVariables } from '@lumpcode/cli-utils';

export type Recipe<Options, V extends LumpVariables = LumpVariables> = (
    options: Options,
) => LumpJsConfig<V>;

export function defineRecipe<Options, V extends LumpVariables = LumpVariables>(
    recipe: Recipe<Options, V>,
): Recipe<Options, V> {
    return recipe;
}