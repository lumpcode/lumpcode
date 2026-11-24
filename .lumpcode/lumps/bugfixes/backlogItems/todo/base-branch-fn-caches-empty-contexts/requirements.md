# Requirements: a function `baseBranch` freezes an empty context list

| Field | Value |
| --- | --- |
| **Backlog** | `base-branch-fn-caches-empty-contexts` · priority **20** · type **fix** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary `@lumpcode/cli` (`utils/jsConfigToRunLumpInput`). `@lumpcode/core`, `@lumpcode/recipes`, and docs unchanged. |

## Problem statement and motivation

[`BaseBranchFnInput`](../../../../../../packages/apps/cli/src/types/BaseBranchFn.ts) says `contexts` is the pre-status raw list from the context source. [Lump config](../../../../../../packages/apps/cli/DOCS/config/lump.md) says `baseBranch` may be `({ effectiveDiscoveryBranch, contexts }) => string`.

[`jsConfigToRunLumpInput`](../../../../../../packages/apps/cli/src/utils/jsConfigToRunLumpInput/main.ts) wraps the author list function in a cache. When `baseBranch` is a function, it fills that cache by calling the list with `codeBasePaths: []`, then passes the cached function to `runLump`. A path template, `contextMatchFn`, or author `getContextListFn` that reads `codeBasePaths` therefore returns `[]` for the base-branch decision and for every later call, including the real scan inside `getToDoContextList`.

1. The function chooses a branch as if the repo had no contexts.
2. `lumpcode run` and `lumpcode lump-plan` stay empty, with no error, while the files that match the template are on disk.
3. The existing unit test stubs a `getContextListFn` that ignores `codeBasePaths`, so the empty cache is invisible.

### Repro (run during bug hunt, Vitest, temp project under `os.tmpdir()`)

Project root contains `src/index.ts`. `localConfigFolderPath` is `<project>/.lumpcode`. Config:

- `contextListJson: { FILE: 'src/{NAME}.ts' }`
- `getContextListFn` and `contextMatchFn` omitted
- `baseBranch: ({ contexts }) => contexts.some((ctx) => ctx.name === 'index') ? 'dev' : 'main'`

After `jsConfigToRunLumpInput` resolves, call the returned `getContextListFn` with `codeBasePaths: [{ isDir: false, path: 'src/index.ts' }]`.

| | Result |
| --- | --- |
| **Actual** | The function ran once during resolve and received `contexts: []`. `baseBranch` is `main`. The later `getContextListFn` call returns `[]`. |
| **Expected** | The function receives the raw context `index` (`FILE` `src/index.ts`). `baseBranch` is `dev`. The list function used for the run returns that same context. |

## Goals

1. A function `baseBranch` sees the same raw context list the run will use, including matches from the project scan.
2. That early read does not pin the run to a list computed from `codeBasePaths: []`.
3. `lumpcode run` and `lumpcode lump-plan` both go through this one resolver.

## Non-goals

- A string `baseBranch`. It does not read contexts, and it must not start an early list call.
- Todo filtering, priority, or `dependsOnContexts`. The function keeps receiving the pre-status raw list.
- Changing `getCodeBasePaths` or `getToDoContextList`, beyond calling the list function they already call.
- Author functions that ignore `codeBasePaths` and return a constant list. They already work and must keep working.

## User stories / use cases

1. As an operator with `baseBranch: ({ contexts }) => ...` and a path template, I get the branch the real contexts imply, and those contexts still run.
2. As an operator using `contextMatchFn` or a `getContextListFn` that reads `codeBasePaths`, the same early resolve does not wipe the list.

## Proposed behavior and UX

No new CLI flag and no config field change.

| `baseBranch` | Context source | Behavior |
| --- | --- | --- |
| string | any | Unchanged. No early list call. |
| function | inline array, or a JSON file whose value is an array | Unchanged. The list does not read `codeBasePaths`, so the function sees that array. |
| function | path template, `contextMatchFn`, or author `getContextListFn` | The list is built from `getCodeBasePaths` of `projectRoot` (`dirname` of `localConfigFolderPath`), the same scan `getToDoContextList` uses. The function receives that list. The `getContextListFn` passed to `runLump` returns that list, not the result of `codeBasePaths: []`. |

`projectRoot` scan failure fails resolve with the scan error. It does not cache an empty list and continue.

`lump-plan` uses the same `jsConfigToRunLumpInput` result. It does not grow a second cache.

## Technical approach

| Step | Where | What |
| --- | --- | --- |
| 1 | `packages/apps/cli/src/utils/jsConfigToRunLumpInput/main.ts` | The early list call that feeds a function `baseBranch` passes the `getCodeBasePaths` result for `projectRoot`. The cache stores that result only. It does not store a call made with `codeBasePaths: []`. |

Owner: `jsConfigToRunLumpInput`. `getToDoContextList` and `planLumpFromJsConfig` keep calling the list function they are given. They do not grow a second cache, and they do not reimplement base-branch resolution.

## Testing strategy

| Level | Where | Proves |
| --- | --- | --- |
| Unit | `packages/apps/cli/src/utils/jsConfigToRunLumpInput/testing/dynamicDiscoveryBranch.unit.test.ts` | Temp project with `src/index.ts`, path template `src/{NAME}.ts`, and a function `baseBranch`. The function's `contexts` include `index`, the resolved branch follows that list, and the returned `getContextListFn` yields `index` when called with the scanned path. A string `baseBranch` still does not depend on contexts. |
| Unit | same file, existing B4 | A `getContextListFn` that ignores `codeBasePaths` and returns a constant list still supplies that list to the function. |

## Acceptance criteria

1. The repro resolves `baseBranch` to `dev` and the run's context list contains `index`.
2. A function `baseBranch` is never decided from a list built with `codeBasePaths: []` when the context source reads those paths.
3. Scan failure fails resolve and does not look like an empty lump.
4. String `baseBranch` and constant `getContextListFn` keep their current results.
5. `lump-plan` and `run` share this resolver. No second empty-list cache exists outside `jsConfigToRunLumpInput`.
