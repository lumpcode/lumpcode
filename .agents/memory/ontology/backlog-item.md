# Backlog item and ticket

A folder under `.lumpcode/lumps/<lump>/backlogItems/todo/<name>/` with a `desc.yml` (`BaseBacklogItem` in `packages/recipes/src/types/BacklogTypes.ts`; `FeatureBacklogItem` and `FeatureBacklogWorkflow` in `packages/recipes/src/recipes/featureBacklog/types.ts`; schemas `packages/recipes/schemas/backlogDesc.schema.json` and `featureBacklogDesc.schema.json`). It moves to `backlogItems/completed/<name>/` when done and gets `completedAt`.

A **ticket** is a child item at `todo/<parent>/tickets/<ticket>/`; the parent is an umbrella that only completes when every ticket is done. Beside `desc.yml` an item may hold `requirements.md`, `testPlan.md`, `expect.yml` (scope contract: `desc`, `files`, `"-"` / `"+"`, `symbols`), and `learnings.md` (written by the `capture-learnings` skill). A completed parent whose learnings were mined into memory carries `learntFrom: true`. Recipe rules: `domain/recipes.md`; authoring: `code-conventions/agent-skills.md`.
