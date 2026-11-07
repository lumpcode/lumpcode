# Requirements: `lump-plan --plan` previews a batch `run` would never pick

| Field | Value |
| --- | --- |
| **Backlog** | `lump-plan-batch-from-remote-todo` · priority **17** · type **fix** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary `@lumpcode/cli` (`utils/planLumpFromJsConfig`, `commands/lump-plan`). `@lumpcode/core` (`getToDoContextList`, `runLump`) and `@lumpcode/recipes` unchanged. |

## Problem statement and motivation

`lumpcode lump-plan <lumpName> --plan` is documented as the dry-run of the next tick ([commands reference](../../../../../../packages/apps/cli/DOCS/reference/commands.md); command description "dry-run the next tick"). `run` picks its batch from the remote todo list: core `runLump` calls `getToDoContextList` and slices the first `numberOfContextsPerBranch` entries. `planLumpFromJsConfig` only calls `getToDoContextList` when `--todoOnly` is set. Without it, the plan batch is `contexts.slice(0, numberOfContextsPerBranch)` over every context, finished or not.

1. `--plan` names a branch and a batch for a context whose marker is already on `origin/<baseBranch>`. An operator who trusts the preview expects the wrong next run.
2. The right answer needs `--todoOnly`, a flag whose help reads as a list filter, not as "make the plan correct".
3. When nothing is left to do, human output prints a blank `plan branch: ` line instead of saying the run has nothing to do.

### Repro (global `lumpcode` 0.8.1, scratch `HOME`, bare `origin`)

1. `git init` a repo on `main` with a bare `origin`, push an empty commit, `lumpcode project-setup --projectName demo --mode dedicated --primaryBranch main`.
2. Add `.lumpcode/lumps/demo/config.js` with `baseBranch: 'main'`, `getContextListFn: () => [ctx-a, ctx-b]`, and a step whose `commandFn` returns `null`. Commit and push.
3. `git commit --allow-empty -m "LUMP: demo - ctx-a"` and push to `origin/main` (ctx-a is finished).
4. `lumpcode lump-plan demo --plan`.

| | Result |
| --- | --- |
| **Actual** | `plan branch: lump/demo/ctx-a`, `plan batch contexts: ctx-a` |
| **Expected** | `plan branch: lump/demo/ctx-b`, `plan batch contexts: ctx-b` (what `lump-plan demo --plan --todoOnly` already prints) |

5. Also push `LUMP: demo - ctx-b`, then `lumpcode lump-plan demo --plan --todoOnly`. Actual: `plan branch: ` with nothing after it. JSON is `"plan": { "contextNames": [], "branchName": "" }`.

## Goals

1. The `--plan` batch, branch name, and workspace commands always come from the same remote todo list and order that `run` uses, with or without `--todoOnly`.
2. `--todoOnly` keeps its current meaning for the printed `contexts` and `promptsByContext` lists.
3. An empty batch prints a clear line in human output.

## Non-goals

- Changing `getToDoContextList`, `runLump`, or how status is derived from marker commits.
- Changing the `--contexts` or `--prompts` output when `--todoOnly` is not set (they keep listing every context).
- Changing the `tooManyOpenBranches` skip, which still runs before the batch is computed.
- Adding a `--contextName` option to `run`.

## User stories / use cases

1. As an operator checking a dedicated worker before a tick, I run `lump-plan <lump> --plan` and see the branch the next `run` will create, so I can trust the preview without remembering `--todoOnly`.
2. As an operator whose campaign is done, I run `lump-plan <lump> --plan` and read that there is nothing left to run.

## Proposed behavior and UX

| Invocation | `contexts` / `promptsByContext` | `plan` batch source |
| --- | --- | --- |
| `--plan` | every context (unchanged) | remote todo list |
| `--plan --todoOnly` | todo contexts only (unchanged) | remote todo list |
| `--plan --contextName X` | `X` only; fails if `X` is not in the resolved list (unchanged) | remote todo list filtered to `X` |

- Batch = remote todo list (order as returned by `getToDoContextList`), filtered to `--contextName` when given, then the first `numberOfContextsPerBranch` (default 1). This is the same slice `runLump` takes.
- `todoContextNames` is set whenever the todo list was computed (`--todoOnly` or `--plan`).
- Empty batch: JSON shape unchanged (`plan: { contextNames: [], branchName: '' }`). Human output prints `plan: no todo contexts` instead of `plan branch: `.
- `--plan` now always performs the locked remote refresh that `--todoOnly` performs today. A refresh failure keeps the existing soft-fall (warning, then all contexts treated as todo), same as `run`.

## Technical approach

| Step | File | Change |
| --- | --- | --- |
| 1 | `packages/apps/cli/src/utils/planLumpFromJsConfig/main.ts` | Compute the todo list once when `todoOnly` is set or `depth === 'plan'`, with the existing `makeLockedRefreshRemoteTrackingRefsFn` + `getToDoContextList` call. Use that one result both for the `--todoOnly` filter and for the plan batch. The plan batch no longer reads the (possibly unfiltered) `contexts` array. |
| 2 | `packages/apps/cli/src/commands/lump-plan/main.ts` | In `formatHumanPlan`, print `plan: no todo contexts` when the plan is not skipped and `contextNames` is empty, instead of the branch / batch lines. |

Ownership: `planLumpFromJsConfig` is the only place that decides the plan batch. Do not add a second todo computation in the command module.

## Testing strategy

| Level | Test | Covers |
| --- | --- | --- |
| Unit | `packages/apps/cli/src/utils/planLumpFromJsConfig/unit.test.ts` (origin fixture already used by "plan depth returns a plan when the only lump branch on origin is already merged") | Two contexts, a `LUMP:` marker for the first on `origin/main`: `depth: 'plan'` without `todoOnly` returns `plan.contextNames` = second context and a branch name for it; `contexts` still lists both. |
| Unit | same file | Both markers on `origin/main`: `depth: 'plan'` returns `plan.contextNames: []`, `branchName: ''`. |
| Unit | same file | `contextName` set to a finished context with `depth: 'plan'`: success, empty plan batch. |
| Unit | `packages/apps/cli/src/commands/lump-plan/unit.test.ts` | Human output prints `plan: no todo contexts` for an empty batch. |

Existing `plan` tests with no markers keep their expected batch (`['ctx1']`).

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/cli/DOCS/reference/commands.md` (`lump-plan`) | `--plan` row: batch and branch are the ones `run` would pick next (remote todo). `--todoOnly` row: filters the listed contexts and prompts. |

## Acceptance criteria

1. The repro ends with `plan batch contexts: ctx-b` for `lump-plan demo --plan` without `--todoOnly`.
2. With every context finished, human `--plan` output contains `plan: no todo contexts` and no blank `plan branch:` line.
3. `--contexts` without `--todoOnly` still lists finished contexts.
4. `getToDoContextList` is called at most once per `planLumpFromJsConfig` call.
5. `npm run build -w=@lumpcode/cli && npm run test -w=@lumpcode/cli` is green.
