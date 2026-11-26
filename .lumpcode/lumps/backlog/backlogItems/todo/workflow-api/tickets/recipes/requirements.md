# Requirements: Workflow recipes

| Field | Value |
| --- | --- |
| **Backlog** | `workflow-api` / `recipes` · priority **15** · type **feature** (breaking) |
| **Status** | Pending implementation |
| **Depends on** | `kit` |
| **Contract** | `../../requirements.md` (Recipes and kit; decisions 13 and 14) |
| **Packages** | `@lumpcode/recipes` (primary: `src/recipes/*`, `schemas/featureBacklogDesc.schema.json`, `schemas/backlogDesc.schema.json`), the website copy of the schemas (`packages/apps/website/public/schemas/`), this repo's `.lumpcode/` (lumps, `helpers/learningsPromptFns.ts`, every `desc.yml`). |

## Problem statement and motivation

The four recipes produce steps, and their options are step-typed: `backlog`'s `stages.<name>.steps`, `featureBacklog`'s `promptFns` (`PromptFn` with `stepIndex` and `stepVariables`). Workflow is the main API, so the recipes must be workflow recipes with the plain names. The backlog item field `workflow` (the list of stages) would clash with the lump's `workflow` function in every doc page.

## Goals

1. `featureBacklog`, `backlog`, `abstractionFinder`, `abstractionBacklog` return a config with `workflow`.
2. Today's code is `featureBacklogSteps`, `backlogSteps`, `abstractionFinderSteps`, `abstractionBacklogSteps`, with identical behavior and options.
3. Workflow recipes take workflow-typed options.
4. `desc.yml` uses `stages`; `workflow` keeps working as a deprecated alias.
5. This repo's lumps run on the workflow recipes.

## Non-goals

- New recipes (`recipe-catalog`). Renaming the abstraction pair (`recipe-catalog-duplication-recipes`).
- Aliases for the old recipe names: breaking by decision.

## Proposed behavior

### Options

```ts
// backlog (workflow)
export type BacklogStageDefinition<V, SV> = {
  workflow: WorkflowFn<V, SV>;                       // was: steps
  completion: 'keepPending' | 'moveToDone';
};
// BacklogOptions: otherwise unchanged (configUrl, backlogItemsDir, includeUmbrellaParents, stages, parseItem, resolveItem)
//   & Omit<LumpJsConfig, 'contextListJson' | 'contextMatchFn' | 'getContextListFn' | 'prompt' | 'steps' | 'workflow'>

// featureBacklog (workflow)
export type FeatureBacklogPromptInput<V> = { context: Context; lumpVariables: V };
export type FeatureBacklogPrompts<V> = {
  [K in FeatureBacklogPromptStage]?: string | ((input: FeatureBacklogPromptInput<V>) => MaybePromise<string>);
};                                                   // was: promptFns
export type FeatureBacklogOptions<V, SV> = {
  configUrl: string | URL;
  implValidateCommand?: string | CommandDescriptor
    | ((input: FeatureBacklogPromptInput<V>) => MaybePromise<string | CommandDescriptor | null>);
  maxAttempts?: number;                              // passed to retryUntilGreen, default 3
  backlogItemsDir?: string;
  primaryDiscoveryBranch?: string;
  itemDiscoveryBranchPrefix?: string;
  prompts?: FeatureBacklogPrompts<V>;
} & Omit<LumpJsConfig<V, SV>,
  'contextListJson' | 'contextMatchFn' | 'getContextListFn' | 'prompt' | 'steps' | 'workflow' | 'discoveryBranch' | 'discoveryBranches'>;

// steps versions: today's types renamed
//   FeatureBacklogStepsOptions, FeatureBacklogStepsPromptFns, BacklogStepsOptions, BacklogStageStepsDefinition,
//   AbstractionFinderStepsOptions, AbstractionBacklogStepsOptions
```

`abstractionFinder` and `abstractionBacklog` follow the same rule: options without a step type are unchanged; step-typed ones become workflow-typed.

### `featureBacklog` stages as workflows

| Stage | Workflow |
| --- | --- |
| `req`, `testPlan` | prompt, then `requireArtifact` on the stage file (today's fix prompts as `requireArtifact` prompts) |
| `testImpl`, `impl`, `directImpl` | prompt, then `retryUntilGreen` with `implValidateCommand` when set, `maxAttempts` |
| `completion` | `setTaskDone` (new workflow kit helper, the workflow version of `folderSetTaskDoneStep`) |

Each returns `succeeded` and a `message` (for example `Tests still red after 3 attempts.`), so `openPrPostTeardown` drafts red PRs. Today's `pushOnValidationFailure: true` behavior is the default: red work is pushed with `succeeded: false`.

### `stages` in `desc.yml`

| `desc.yml` | Result |
| --- | --- |
| `stages: [req, impl]` | used |
| `workflow: [req, impl]` | used, one warning per item per run: `<item>: "workflow" is deprecated in desc.yml; rename it to "stages".` |
| both | fails: `<item>: use "stages" only ("workflow" is its deprecated name).` |

Context variable `STAGES` is set; `WORKFLOW` is still set to the same value until the alias is removed. Both schemas gain `stages` and mark `workflow` deprecated (`"deprecated": true` with a description).

### This repo

| What | Change |
| --- | --- |
| `.lumpcode/lumps/{backlog,qol,bugfixes}/config.ts` | `featureBacklog` with `prompts` |
| `.lumpcode/helpers/learningsPromptFns.ts` | becomes `learningsPrompts.ts`, returning `FeatureBacklogPrompts` |
| `.lumpcode/lumps/docs/config.ts` | `backlog` with `stages.<name>.workflow` |
| `.lumpcode/lumps/abstractionFinder`, `abstractionImplementer` | workflow recipes |
| every `.lumpcode/lumps/*/backlogItems/**/desc.yml` | `workflow:` → `stages:`, one scripted pass, no other change |
| `packages/recipes/src/recipes/*` desc fixtures and tests | `stages` |

## Technical approach

| Step | Files | Change |
| --- | --- | --- |
| 1 | `src/recipes/<recipe>/` | Move today's code to `<recipe>Steps` (exports and types renamed); add the workflow version beside it, sharing discovery, item parsing and default prompt texts (one module each, no copy) |
| 2 | `src/kit/workflow/setTaskDone.ts` | Workflow version of `folderSetTaskDoneStep` |
| 3 | `src/recipes/featureBacklog/workflow.ts`, `types.ts` | Read `stages`, alias `workflow`, both-fields error, `STAGES` variable |
| 4 | `schemas/*.schema.json` and the website copies | `stages`, deprecated `workflow` |
| 5 | `.lumpcode/` | The table above |

## Testing strategy

| Level | Test | Covers |
| --- | --- | --- |
| Unit | `<recipe>Steps` tests | Today's recipe tests, renamed, unchanged expectations |
| Unit | workflow recipe tests with fake `agent` and `shell` | Each stage's calls and result; `prompts` string and function; `maxAttempts` |
| Unit | `featureBacklog` parse tests | `stages`, alias warning, both-fields error, `STAGES` and `WORKFLOW` variables |
| Integration | `run` of a `featureBacklog` fixture under `os.tmpdir()` | A ticket goes `req` → `impl` and pushes; a red check pushes with `succeeded: false` |
| Repo | `lump-plan` for every lump in `.lumpcode/lumps/` | Valid, with the same contexts as before |

## Docs updates

`DOCS/author/recipes.md`: workflow recipes first, then "Steps recipes" with the `…Steps` names. Backlog docs and examples: `stages`. `CHANGELOG`: the breaking renames and the `stages` field. `.agents/memory/domain/repo-lumps.md`: `learningsPrompts`, `stages`. The narrative rewrite is `workflow-first-docs-and-website`.

## Acceptance criteria

1. `featureBacklogSteps(options)` with today's options returns the same config as today's `featureBacklog(options)`.
2. `featureBacklog` returns a config with `workflow` and no `steps`.
3. Every `desc.yml` in this repo uses `stages`, and an item with `workflow` still runs with the warning.
4. `lump-plan` lists the same contexts for `backlog`, `qol`, `bugfixes`, `docs`, `abstractionFinder` and `abstractionImplementer` before and after.
