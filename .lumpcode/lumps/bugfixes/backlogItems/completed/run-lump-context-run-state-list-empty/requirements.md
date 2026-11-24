# Requirements: `runLump` returns an empty `contextRunStateList`

| Field | Value |
| --- | --- |
| **Backlog** | `run-lump-context-run-state-list-empty` · priority **20** · type **fix** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary `@lumpcode/core` (`helpers/executeStepsForContextList`). `@lumpcode/cli`, `@lumpcode/recipes`, and docs unchanged. |

## Problem statement and motivation

The [core README](../../../../../../packages/core/README.md) documents the `runLump` return value as `result: { branchName, contextNames, contextRunStateList: ContextRunState[] }`. `contextRunState` is the per-context object that `setupFn` seeds and every step of that context can mutate.

[`packages/core/src/helpers/executeStepsForContextList/main.ts`](../../../../../../packages/core/src/helpers/executeStepsForContextList/main.ts) declares `const contextRunStateList: ContextRunState[] = []`, passes it to `branchFn`, and returns it. Nothing ever adds to it. Each context's `contextRunState` stays a local inside the loop.

1. A library caller that reads `contextRunStateList` after a successful run always gets `[]`, so any state the steps recorded (validation flags, agent verdicts, counters) is lost.
2. `lumpcode run --json` puts the run result in `data`, so operators see `"contextRunStateList": []` even when every context set state.
3. No test asserts the list's contents, so the gap is invisible to the suite.

### Repro (run during bug hunt, built `@lumpcode/core`, temp git repo under `os.tmpdir()`)

Script: call `runLump` with two contexts (`ctx-a`, `ctx-b`), `numberOfContextsPerBranch: 2`, `setupFn` returning `{ contextRunState: { seeded: true } }`, and one step whose `commandFn` runs `true` and whose `postCommandExecFn` sets `contextRunState.touchedBy = context.name`. Workspace and git functions are no-ops; `refreshRemoteTrackingRefsFn` returns success.

| | Value |
| --- | --- |
| **Actual** | `{"branchName":"lump/demo/ctx-a","contextNames":["ctx-a","ctx-b"],"contextRunStateList":[]}` |
| **Expected** | `contextRunStateList` is `[{"seeded":true,"touchedBy":"ctx-a"},{"seeded":true,"touchedBy":"ctx-b"}]` |

Both contexts ran (the engine logged `Running context "ctx-a" (1/2)` and `(2/2)`), and the result still carried no state.

## Goals

1. A successful `runLump` returns one `contextRunState` per entry in `contextNames`, in the same order.
2. Each entry is the state object the context's steps saw, including mutations from `postCommandExecFn`, `StepFn`, `promptFn`, and `commandFn`.

## Non-goals

- `branchFn` input. `branchFn` runs before any context's `setupFn`, so its `contextRunStateList` stays empty. That is not part of this fix.
- The early "no todo contexts" result in `runLump` (`contextRunStateList: []` stays correct there).
- Failure results. `Failure<ExecuteStepsFailureData>` carries no state and keeps its shape.
- `lump-plan` (`planLumpFromJsConfig` passes its own empty list to `branchFn`).
- Changing `ContextRunState`, `SetupFn`, or the README contract.

## User stories / use cases

1. As a library author calling `runLump` — I read `contextRunStateList` after a run to see what each context's steps recorded, so I can report or act on it without re-deriving it.
2. As an operator scripting `lumpcode run --json` — the result's `contextRunStateList` shows each context's final state instead of an empty array.

## Proposed behavior and UX

| Field of `runLump` success `result` | Contract |
| --- | --- |
| `contextNames` | Unchanged. Names of the batch that ran. |
| `contextRunStateList` | Same length and order as `contextNames`. Entry `i` is the `contextRunState` of context `i`: the object from `setupFn` (or `{}` when `setupFn` returns nothing), as it stands after that context's steps and `teardownFn` ran. |

The entries are the live objects the steps mutated, not copies taken before the walk.

## Technical approach

| Step | Where | What |
| --- | --- | --- |
| 1 | `packages/core/src/helpers/executeStepsForContextList/main.ts` | After resolving each context's `contextRunState` from `setupFn`, record it in the returned `contextRunStateList` at that context's index. The success result then carries one entry per context. |

Owner: `executeStepsForContextList`. `runLump` already forwards its result and must not build a second list. CLI callers (`runLumpFromJsConfig`, `commands/run`) pass the result through and need no change.

## Testing strategy

| Level | Where | Proves |
| --- | --- | --- |
| Unit | `packages/core/src/helpers/executeStepsForContextList/testing/general.unit.test.ts` | Two contexts in one batch, each step mutates `contextRunState`: the success result's `contextRunStateList` has two entries, in `contextNames` order, holding the `setupFn` seed plus the mutations. A `setupFn` that returns nothing yields `{}` for that context. |
| Unit | `packages/core/src/usages/runLump/unit.test.ts` | `runLump` success result forwards the same non-empty list. The no-todo path still returns `[]`. |

CLI unit tests that stub `contextRunStateList: []` in a fake run result stay as they are.

## Acceptance criteria

1. The repro above prints `contextRunStateList` with one entry per context, matching the expected value.
2. `contextRunStateList.length === contextNames.length` on every successful `runLump` that ran contexts.
3. Each entry reflects mutations made by that context's steps.
4. The no-todo result and failure results keep their current shape.
5. The list is built only in `executeStepsForContextList`; `runLump` adds no second construction.
