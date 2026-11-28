# Learnings

## Expected
`desc.yml` (`workflow: [manualReq, testImpl, impl]`, depends on `kit`): `featureBacklog`, `backlog`, `abstractionFinder`, and `abstractionBacklog` become workflow recipes. Today's code stays as `featureBacklogSteps`, `backlogSteps`, `abstractionFinderSteps`, and `abstractionBacklogSteps`, with no aliases. `desc.yml` `workflow` becomes `stages` (deprecated alias) and the context variable `WORKFLOW` becomes `STAGES`. This repo's lumps and desc files move with them.

`requirements.md`: workflow-typed options (`prompts`, `stages.<name>.workflow`, `maxAttempts`), artifact stages prompt then `requireArtifact`, check stages prompt then `retryUntilGreen`, completion calls `setTaskDone`. `stages` is used, `workflow` warns once per item per run, and both fields fail. `STAGES` and `WORKFLOW` are set to the same value. Tests: renamed steps suites, workflow tests with a fake `agent` and `shell`, parse tests, a `run` under `os.tmpdir()` (req then impl pushes; a red check pushes with `succeeded: false`), and `lump-plan` for the lumps under `.lumpcode/lumps/`. Packages are `@lumpcode/recipes`, the schema files, and this repo's `.lumpcode/`. No `testPlan.md` or `expect.yml` on this item. The parent `requirements.md` is the contract (decisions 13 and 14). This stage writes skipped tests and does not create `testPlan.md`.

## Landed
Working tree only. The marker commit for this stage does not exist yet.

Skipped tests:
- `packages/recipes/src/recipes/featureBacklog/workflow.unit.test.ts`
- `packages/recipes/src/recipes/featureBacklog/stages.unit.test.ts`
- `packages/recipes/src/recipes/featureBacklog/workflow.integration.test.ts`
- `packages/recipes/src/recipes/backlog/workflow.unit.test.ts`
- `packages/recipes/src/recipes/abstractionFinder/workflow.unit.test.ts`
- `packages/recipes/src/recipes/abstractionBacklog/workflow.unit.test.ts`
- `packages/recipes/src/recipes/recipes.types.test.ts`
- `packages/recipes/src/recipes/descSchema.unit.test.ts`
- `packages/recipes/src/kit/workflow/setTaskDone.unit.test.ts`
- `packages/apps/cli/src/commands/lump-plan/recipeWorkflow.unit.test.ts`

Today's recipe tests stay live under the Steps names in `featureBacklog/main.unit.test.ts`, `backlog/main.unit.test.ts`, and `abstractionFinder/main.unit.test.ts`.

So those suites import and the repo still typechecks, this stage also renames today's recipes to the Steps exports (no aliases), adds throwing workflow factories, and points this repo's lumps at the Steps recipes:
- `packages/recipes/src/recipes/featureBacklog/` (`main.ts`, `types.ts`, `index.ts`, `workflowRecipe.ts`)
- `packages/recipes/src/recipes/backlog/` (`main.ts`, `types.ts`, `index.ts`, `workflowRecipe.ts`)
- `packages/recipes/src/recipes/abstractionFinder/` (`main.ts`, `index.ts`, `workflowRecipe.ts`)
- `packages/recipes/src/recipes/abstractionBacklog/` (`main.ts`, `index.ts`, `workflowRecipe.ts`)
- `packages/recipes/src/kit/workflow/setTaskDone.ts`, `packages/recipes/src/kit/index.ts`
- `.lumpcode/lumps/{backlog,qol,bugfixes,docs,abstractionFinder}/config.ts`, `.lumpcode/lumps/abstractionImplementer/config.ts`
- `.lumpcode/helpers/learningsPromptFns.ts` (`FeatureBacklogStepsPromptFns`)

The workflow factories throw `not implemented`. `desc.yml` files still use `workflow:`. Schemas are unchanged.

## Adjustments
A workflow call opens one `agent.session()` with no arguments and returns `{ succeeded, message }` without setting `push`. A red check still pushes because the engine default for `push` is true.

Artifact stages (`req`, `testPlan`) send the stage prompt, then `requireArtifact` with today's fix prompt and no verification output (the text contains `(no output captured)`). `requireArtifact` keeps its default of 2 attempts. Success is `Wrote <path>.` Missing is `Missing <path>.` The path is `REQ_FILE` or `TEST_PLAN_FILE`.

Check stages (`testImpl`, `impl`, `directImpl`) send the stage prompt, then `retryUntilGreen` when `implValidateCommand` is set. `maxAttempts` defaults to 3 and is fix attempts after the first check. A green check returns `Checks passed.` A red check returns `Tests still red after ${maxAttempts} attempts.` (so the default message is `Tests still red after 3 attempts.`). An omitted command, or a function that returns null, prompts once and does not call `shell`. `testImpl` runs that check when the command is set. A prompt function receives `{ context, lumpVariables }` only.

`completion` does not prompt. It moves the item and returns `Moved <task name> to completed.`

`backlog` runs the stage `workflow`, then `setTaskDone` when completion is `moveToDone`, including when that workflow returns `succeeded: false`. The recipe returns the stage workflow's result. `keepPending` leaves the item in `todo/`.

`setTaskDone` moves `todo/` to the same relative path under `completed/` and stamps `completedAt`. A missing `BACKLOG_ITEMS_DIR` throws `setTaskDone: context "<name>" must set BACKLOG_ITEMS_DIR to the backlog items directory`.

Validation errors name the field that was set (`stages` or `workflow`). The alias warning is exactly `<item>: "workflow" is deprecated in desc.yml; rename it to "stages".`, once per item per `getContextListFn` call. Both fields throw `<item>: use "stages" only ("workflow" is its deprecated name).`

`abstractionFinder` runs `scanCommand` through `shell` before the prompt. A function receives `WorkflowInput` and its string or descriptor is that command. A caller `workflow` replaces the default prompt and still runs after the scan. `abstractionBacklog`'s `implSteps` becomes an optional `workflow` that replaces the default implement workflow. Its check command matches `featureBacklog`'s, with no `maxAttempts` option, so a red check uses the 3-attempt message. The same-contexts check compares `featureBacklog` and `featureBacklogSteps` on one fixture. `lump-plan` for `backlog`, `qol`, `bugfixes`, `docs`, `abstractionFinder`, and `abstractionImplementer` expects `run: 'workflow'`. Both desc schemas gain `stages` as an array; `workflow` is `"deprecated": true` and its description mentions `stages`. The feature schema's `stages` enum is `req`, `manualReq`, `testPlan`, `testImpl`, `impl`, `directImpl`. The website copies those schema files when its config loads.
