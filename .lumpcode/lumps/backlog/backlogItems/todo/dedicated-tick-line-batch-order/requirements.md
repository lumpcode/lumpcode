# Requirements: Dedicated tick line order by batch scores

| Field | Value |
| --- | --- |
| **Backlog** | `dedicated-tick-line-batch-order` · priority **5** · type **feature** · workflow **directImpl** |
| **Status** | Pending implementation |
| **Depends on** | `dedicated-tick-line-priority` (shipped) |
| **Packages** | Primary: `packages/apps/cli` (score, reorder, run pool, one `concepts.md` sentence). `@lumpcode/core` `getToDoContextList` / `runLump` unchanged. Recipes unchanged. |

## Problem statement and motivation

Dedicated collect scores each `(lumpName, scanBranch)` as the **min** of every remaining eligible todo, then `runLump` takes only the first `numberOfContextsPerBranch` of that list. Two lines of the same lump can therefore interleave the wrong way: a weaker line’s first batch runs before a stronger line’s later batch.

Concrete pain (`numberOfContextsPerBranch: 2`):

1. Line B todos `1, 2, 3` scores `1`. Line A todos `10, 11, 12` scores `10`. One tick with two collect rows runs `B(1, 2)` then `A(10, 11)`. Desired: `B(1, 2)` then `B(3)`.
2. Scalar min cannot give the same line two rows, so A’s first batch jumps B’s leftover `3`.
3. Emitting `[B, B]` without a pool rule is unsafe under worktree `maxParallelRun > 1`: both invokes pick todos before `setupWorkspaceFn`, so path locks serialize the same folder after both already chose `1, 2`.

## Goals

1. Score each line as the list of remaining **batch** priorities, one entry per `runLump` invoke left on that line.
2. Reorder still returns one row per collect row (same length). For each `lumpName`, fill that lump’s non-failed rows from the merged batch stream (a line may repeat).
3. Same `(lumpName, effectiveDiscoveryBranch)` never runs concurrently in `runLumpLinesWithConcurrency`.
4. Shared collect, `lumpcode run`, and `lump-plan` stay unchanged. Cap gate stays `evaluateTooManyOpenBranchesSkip` only.
5. Tick log lists whatever reorder returns. `concepts.md` states the batch-order rule.

## Non-goals

- Growing the collect list to one row per leftover batch (`[B, B, A, A]` in one tick). Parked as `tick-line-slot-count` (slot count stays matching discovery-line cardinality).
- Changing core `getToDoContextList` sort / `|| 0`, or making `runLump` drain more than one batch per invoke.
- Per-`(lumpName, discoveryLine)` caps, context allowlists, or packing todos across lines.
- Global sort across different `lumpName`s.
- Serializing different discovery lines of the same lump (A vs B may still start together).
- New CLI flags. Website copy.

## User stories / use cases

1. **Operator (repeat stronger line)** — B batches `[1, 3]`, A `[10, 12]`, two collect rows. This tick is `[B, B]`. A waits for a later tick.
2. **Operator (packed batches)** — `numberOfContextsPerBranch: 2`, A todos `1, 2, 5, 6`, B `3, 4, 7, 8`. Scores `A: [1, 5]`, `B: [3, 7]`. This tick `[A, B]` → `A(1, 2)` then `B(3, 4)`.
3. **Operator (leftover row)** — Three rows, `B: [1]`, `A: [10, 12]`, `C` empty. Stream places `B` then `A` then `A`. Result `[B, A, A]`. `C` is dropped this tick.
4. **Operator (empty leftovers)** — Three rows, `B: [1]`, A empty, C empty. Result `[B, A, C]`.
5. **Operator (tie)** — Collect order A then B, scores `A: [5, 6]`, `B: [5, 8]`. `A@5` wins the first row (collect index). Result `[A, B]`.
6. **Operator (other lump)** — Rows `backlog@dev`, `other@dev`, `backlog@feature`. Only backlog rows move. `other` keeps its index.
7. **Operator (score failure)** — Failed line stays in its collect index and still runs. Other scored lines of that lump reorder among the remaining rows.
8. **Operator (worktree parallel)** — Queue `[B, B]`, `maxParallelRun: 2`. Second `B` does not start until the first finishes, then sees `1, 2` done and takes `3`.
9. **Operator (shared)** — No scoring, no reorder. Pool key rule is a no-op when names are unique.

## Proposed behavior and UX

No new CLI syntax. `DedicatedLumpLine` / tick item shape unchanged.

### Line score

Canonical owner: **`scoreDedicatedLumpLine`**. Collect must not recompute batch lists.

```ts
type LineScore =
  | { kind: 'scored'; values: number[] }
  | { kind: 'empty' }
  | { kind: 'failed'; reason: string };

function batchScores(
  todos: Context[],
  numberOfContextsPerBranch: number,
): LineScore;
```

| `kind` | When |
| --- | --- |
| `scored` | Eligible todo list non-empty. `values[i]` is `options.priority \|\| 0` of `todos[i * n]`, `n = max(1, numberOfContextsPerBranch)`. Todos are the `getToDoContextList` result (already sorted by that same rule). Do not re-sort. |
| `empty` | Todo list success and length 0 |
| `failed` | Score could not be computed |

Drop scalar `value`. Ready snapshot from `snapshotDedicatedLumpLine` carries `numberOfContextsPerBranch` from that line’s `RunLumpInput` (omit in spies → treat as `1`).

### Slot-stable reorder

Canonical owner: **`reorderDedicatedLumpLines`**. Output length equals input length.

```ts
function reorderDedicatedLumpLines(
  items: readonly ScoredLumpLine[],
): DedicatedLumpLine[];
```

For each `lumpName` independently:

| Kind | Placement |
| --- | --- |
| `failed` | Frozen at its collect index |
| `scored` | Flatten `{ line, collectIndex, batchIndex, score }` from `values`. Sort by score ascending, then `collectIndex`, then `batchIndex`. Fill that lump’s non-failed rows from the front of that stream (same line may repeat) |
| unused leftover rows | Lines that appear **zero** times in the taken prefix, **scored before empty**, collect order inside each group |

Other lumps’ indices are untouched.

### Same-line pool serialize

Canonical owner: **`runLumpLinesWithConcurrency`**. No new input field. Always on.

Key: `lumpName` + `effectiveDiscoveryBranch` (empty string when omitted). Do not start a line while another invoke with that key is in flight. Unique-key queues keep today’s start order and concurrency. Failure isolation unchanged.

### Tick log and docs

`tick N — running K lump(s)… [name@branch, …]` uses the reordered list (repeats possible). Rewrite the dedicated line-order sentence in [`packages/apps/cli/DOCS/concepts.md`](../../../../../../packages/apps/cli/DOCS/concepts.md): best next **batch** (every `numberOfContextsPerBranch`-th sorted eligible-todo priority); a line may occupy more than one of that lump’s collect rows; same line is sequential in the pool; cap still lump-wide.

## Technical approach

| Step | Change |
| --- | --- |
| 1. Score | `packages/apps/cli/src/utils/scoreDedicatedLumpLine/` — `LineScore.values`, `batchScores`, snapshot field. Only this module chunks todos for tick ranking. |
| 2. Reorder | `packages/apps/cli/src/utils/reorderDedicatedLumpLines/` — fill from merged batch stream as above. |
| 3. Pool | `packages/apps/cli/src/utils/runLumpLinesWithConcurrency/` — in-flight key gate. `runForeground` stays a caller. |
| 4. Docs | One sentence in `concepts.md`. |

### Affected surfaces

| Surface | Role |
| --- | --- |
| `utils/scoreDedicatedLumpLine/` | **Owner** of `LineScore` / `batchScores` |
| `utils/reorderDedicatedLumpLines/` | **Owner** of slot fill |
| `utils/runLumpLinesWithConcurrency/` | **Owner** of same-key serialize |
| `commands/start/testing/multiDiscoveryBranches.unit.test.ts` | Mock `value` → `values`; ready-snapshot spies may add `numberOfContextsPerBranch` |
| `DOCS/concepts.md` | Line-order sentence |
| `utils/launchStartDaemon/runForeground.ts` | Unchanged caller |

## Testing strategy

| Level | Coverage |
| --- | --- |
| Unit `scoreDedicatedLumpLine` | Empty → `empty`. `n = 1` / omit → `values` is every sorted priority (`\|\| 0`). `n = 2` todos `1, 2, 5, 6` → `[1, 5]`. `n < 1` treated as `1`. Failure / throw → `failed`. Existing min-priority cases become single-element `values`. |
| Unit `reorderDedicatedLumpLines` | `B: [1, 3]`, `A: [10, 12]` two rows → `[B, B]`. Packed example → `[A, B]`. Leftover `[B, A, A]` vs `[B, A, C]`. Tie uses collect order. Failed frozen. Other lump stays. Existing scalar fixtures become `values: [n]`. |
| Unit `runLumpLinesWithConcurrency` | Keep P1–P6. New: concurrency 2, items `[B, B]` (same discovery branch) — second start only after first completes; a different line can start while `B` is in flight. |
| Start `multiDiscoveryBranches.unit.test.ts` | Spies compile (`values` not `value`). Existing “better line first” still holds for one-batch scores. |

E2E not required.

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/cli/DOCS/concepts.md` | Replace the “best eligible-todo-priority order” sentence with the batch + same-line sequential rule. |

## Acceptance criteria

1. Dedicated tick, two lines, `numberOfContextsPerBranch: 2`, B todos `1, 2, 3`, A `10, 11, 12`: reorder returns `[B, B]`.
2. Same config, A `1, 2, 5, 6`, B `3, 4, 7, 8`: scores `[1, 5]` and `[3, 7]`; reorder `[A, B]`.
3. Output length always equals collect length. Failed rows do not move.
4. A third lump between two lines of L keeps its index.
5. Shared ticks do not score or reorder.
6. `lumpcode run` / `lump-plan` unchanged.
7. Concurrency > 1: two queue items with the same `lumpName` + `effectiveDiscoveryBranch` never overlap in `runLumpLine`.
8. Tick label matches the reordered list (repeats allowed).
9. `concepts.md` describes batch order, not scalar min.
10. No second batch-list or same-key gate outside the three named owners.
