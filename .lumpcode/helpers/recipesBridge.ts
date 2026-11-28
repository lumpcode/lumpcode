import * as recipes from '@lumpcode/recipes';

// Bridge until the workers run 0.11.0. The published 0.10.x recipes name the
// steps recipes and kit without the Steps suffix (featureBacklog,
// retryUntilGreen, ...); this branch's source names them *Steps and gives the
// plain names to the workflow versions. Pick whichever the loaded
// @lumpcode/recipes exports so this repo's lumps load on both. Remove with
// repo-lumps-workflow (or once every worker runs 0.11.0).

type Recipes = typeof recipes;
const exported = recipes as unknown as Record<string, unknown>;

function pick<K extends keyof Recipes>(name: K, legacyName: string): Recipes[K] {
    const value = exported[name as string] ?? exported[legacyName];
    if (value === undefined) {
        throw new Error(`@lumpcode/recipes exports neither ${String(name)} nor ${legacyName}.`);
    }
    return value as Recipes[K];
}

export const featureBacklogSteps = pick('featureBacklogSteps', 'featureBacklog');
export const backlogSteps = pick('backlogSteps', 'backlog');
export const abstractionFinderSteps = pick('abstractionFinderSteps', 'abstractionFinder');
export const abstractionBacklogSteps = pick('abstractionBacklogSteps', 'abstractionBacklog');
export const retryUntilGreenSteps = pick('retryUntilGreenSteps', 'retryUntilGreen');
