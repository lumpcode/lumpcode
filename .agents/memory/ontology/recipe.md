# Recipe and kit

`@lumpcode/recipes` (`packages/recipes/`) has two layers. A **recipe** is a factory that returns a whole lump config from parameters (`backlog`, `featureBacklog`, `abstractionFinder`, `abstractionBacklog`; `Recipe` in `packages/recipes/src/types/Recipe.ts`). The **kit** (`packages/recipes/src/kit/`) is the plumbing recipes are built from and authors can use directly (`retryUntilGreen`, `requireArtifactStep`, `openPrPostTeardown`, `folderBacklogContexts`, …). Behavior: `domain/recipes.md`.
