# Requirements: `contextListJson` path patterns emit contexts with missing paths

| Field | Value |
| --- | --- |
| **Backlog** | `context-list-json-partial-match` · priority **20** · type **fix** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary `@lumpcode/cli` (`makeGetContextListFnFromTemplate`). `@lumpcode/core`, `@lumpcode/recipes`, and docs unchanged. |

## Problem statement and motivation

[Contexts](../../../../../../packages/apps/cli/DOCS/author/contexts.md) says a `contextListJson` object "creates one context per capture where **every** path exists" and "A folder missing its test is skipped". [First PR](../../../../../../packages/apps/cli/DOCS/start/first-pr.md) repeats it: "Each folder name `{NAME}` where both files exist becomes one context".

[`packages/apps/cli/src/utils/makeGetContextListFnFromTemplate/main.ts`](../../../../../../packages/apps/cli/src/utils/makeGetContextListFnFromTemplate/main.ts) creates the context entry the first time any key matches a scanned path, and never drops entries that lack the other keys.

1. A folder missing one of the files still becomes a context and is run.
2. Its prompt keeps the unfilled placeholder (`@{TEST}`) and is sent to the agent as is.
3. `contextOptionsFn` is called for these partial contexts too.

### Repro (run during bug hunt, built CLI, temp repo)

Files: `src/components/UserCard/index.tsx`, `src/components/UserCard/index.test.tsx`, `src/components/DataTable/index.tsx` (no test). Lump `config.json`:

```json
{
  "baseBranch": "main",
  "contextListJson": {
    "COMPONENT": "src/components/{NAME}/index.tsx",
    "TEST": "src/components/{NAME}/index.test.tsx"
  },
  "prompt": { "promptTemplate": "Improve @{COMPONENT} and @{TEST}.", "command": "claude-code" }
}
```

`lumpcode lump-plan comps --contexts --prompts`:

| | Result |
| --- | --- |
| **Actual** | `contexts (2): DataTable, UserCard`. The `DataTable` prompt is `Improve @src/components/DataTable/index.tsx and @{TEST}.` |
| **Expected** | `contexts (1): UserCard`. |

## Goals

1. A path-pattern context is emitted only when every key whose pattern contains at least one placeholder matched a scanned path for that context name.
2. `contextOptionsFn` runs only for emitted contexts.

## Non-goals

- Changing keys whose pattern has no placeholder. They still never match and are not required, as today (`emits no context for a no-placeholder template value`).
- Changing capture syntax, modifiers, the `-` join of several captures, or context ordering.
- Changing the array form of `contextListJson`, `contextMatchFn`, or `getContextListFn`.

## User stories / use cases

1. As an operator porting components with `COMPONENT` + `TEST` patterns, folders without a test are skipped, so the agent never gets a prompt with an unfilled `@{TEST}`.

## Proposed behavior and UX

No config or CLI change. `makeGetContextListFnFromTemplate(jsonTemplate, modifiers?, contextOptionsFn?)` keeps its signature. Its result contains only contexts whose `variables` hold a path for every placeholder-bearing key of `jsonTemplate`.

## Technical approach

| Step | File | Change |
| --- | --- | --- |
| 1 | `packages/apps/cli/src/utils/makeGetContextListFnFromTemplate/main.ts` | After the scan, drop entries missing any placeholder-bearing key, before `contextOptionsFn` is applied. |

`makeGetContextListFnFromTemplate` owns this rule. `jsConfigToRunLumpInput` and other callers must not add their own filter.

## Testing strategy

| Level | Test | Covers |
| --- | --- | --- |
| Unit | `packages/apps/cli/src/utils/makeGetContextListFnFromTemplate/unit.test.ts`: new case with the repro's three paths | Only `UserCard` is returned, with both variables. |
| Unit | same file: the same case with a `contextOptionsFn` spy | The spy is not called for `DataTable`. |
| Unit | existing cases in the same file | Pass unchanged (every key already matches in each). |

## Acceptance criteria

1. The repro lists one context, `UserCard`.
2. A template with a single placeholder key behaves as today.
3. `npm run test -w=@lumpcode/cli` is green.
