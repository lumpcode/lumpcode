# Requirements: Dedicated tick line order by todo priority

| Field | Value |
| --- | --- |
| **Backlog** | `dedicated-tick-line-priority` · priority **4** · type **feature** · workflow **directImpl** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary: `packages/apps/cli` (daemon collect + two utils). `@lumpcode/core` `getToDoContextList` / `runLump` unchanged. Recipes unchanged. |

## Problem statement and motivation

A dedicated tick expands scan branches (resolved primary first), then enqueues every matching `(lumpName, scanBranch)` and runs that list in collect order. `maximumNumberOfConcurrentBranches` is one cap per `lumpName` across every discovery line. Context `options.priority` only sorts todos **inside** one `runLump`. A lump that is eligible on `dev` and on `feature/*` therefore always spends the cap on the primary line when that line has any work, and later lines skip with `tooManyOpenBranches` forever.

Concrete pain:

1. `featureBacklog` tickets only match `feature/<parent>`; top-level `directImpl` matches `dev`. With cap `1`, `dev` work (even priority 10) blocks tickets (priority 3).
2. Each tick repeats the same primary-first spend. Merging the `dev` PR just frees the slot for the next `dev` context.
3. `maxParallelRun` and path/git lock waits are not this starvation; the shared per-lump cap plus scan-major **run** order is.

## Goals

1. Dedicated collect still produces the same `{ lumpName, effectiveDiscoveryBranch }` items. Only **order** changes.
2. For each `lumpName`, lines with eligible todos run in best-priority-first order (lower `options.priority` sooner) before that lump’s cap is spent.
3. Other lumps keep their queue slots (slot-stable). Shared mode, `lumpcode run`, and `lump-plan` stay unchanged.
4. Remaining lines of the same lump are still invoked; `evaluateTooManyOpenBranchesSkip` stays the only cap gate.
5. Tick log `running N lump(s)… [lump@branch, …]` uses the reordered list. `concepts.md` states the dedicated line-order rule.

## Non-goals

- Per-`(lumpName, discoveryLine)` caps (cap stays lump-wide).
- Picking named contexts, packing across lines, or a context allowlist on `runLumpFromLumpName`.
- Global sort across different `lumpName`s (priority scales are campaign-local).
- Omitting later lines once the cap is spent; clustering all of a lump’s lines into one block.
- Changing core `getToDoContextList` missing-priority `|| 0`.
- Fixing two lines of the same lump starting together under `maxParallelRun > 1` (slot-stable only reduces that).
- Shared-mode glob fan-out or new CLI flags.

## User stories / use cases

1. **Operator (starvation)** — Lump `backlog` is eligible on `dev` (best todo priority 10) and `feature/git-driven-daemon-configs` (best 3), cap `1`. The tick runs the feature line first. `dev` then skips `tooManyOpenBranches`.
2. **Operator (tie)** — Two lines of the same lump have the same best todo priority. Run order among those lines matches today’s expand/scan order (primary first).
3. **Operator (empty line)** — A scan line has no eligible todos. It sorts after any scored line of that lump, still runs, opens no branch, does not consume the cap.
4. **Operator (other lump)** — Queue was `backlog@dev`, `other@dev`, `backlog@feature`. After reorder it is `backlog@feature`, `other@dev`, `backlog@dev`. `other` stays in the middle.
5. **Operator (score failure)** — Todo/status for one line fails. Warn, leave that line in its collect slot, still invoke it. Other scored lines of that lump still reorder among the remaining slots of that lump.
6. **Operator (shared)** — Single-primary queue. No scoring, no reorder.

## Proposed behavior and UX

No new CLI syntax. `RunLumpQueueItem` and `runLumpQueueWithConcurrency` stay:

```ts
type RunLumpQueueItem = {
    lumpName: string;
    effectiveDiscoveryBranch?: string;
};
```

### Line score

```ts
type LineScore =
    | { kind: 'scored'; value: number }
    | { kind: 'empty' }
    | { kind: 'failed' };

type ScoredRunLumpQueueItem = RunLumpQueueItem & { lineScore: LineScore };
```

| `kind` | When | Sort vs other lines of the **same** `lumpName` |
| --- | --- | --- |
| `scored` | Eligible todo list non-empty | Ascending `value` (lower sooner). Tie: collect/scan order (stable). |
| `empty` | Todo list success and length 0 | After every `scored` line of that lump; among empties, collect order. |
| `failed` | Score could not be computed | **Frozen** in its collect slot. Does not move. |

`value` is the minimum of each eligible todo’s `options.priority`, using the same missing-priority rule as core `getToDoContextList` (`|| 0`).

### Slot-stable reorder

Canonical owner: **`reorderRunLumpQueueByLineScore`**.

```ts
function reorderRunLumpQueueByLineScore(
    items: readonly ScoredRunLumpQueueItem[],
): RunLumpQueueItem[];
```

For each `lumpName` independently:

1. Leave items of other lumps in place.
2. Freeze every `failed` line of this lump in its current index.
3. Take this lump’s remaining slots left to right. Fill them with this lump’s `scored` lines (sorted as above), then this lump’s `empty` lines (collect order).

The function returns `RunLumpQueueItem[]` (no `lineScore` on the runner). Shared collect must not call it.

### Scoring (dedicated collect only)

Canonical owner: **`scoreDedicatedLumpLine`**. `collectTickLumps` must not reimplement todo-list + min-priority.

```ts
function scoreDedicatedLumpLine(input: {
    lumpName: string;
    jsConfig: LumpJsConfig;
    effectiveDiscoveryBranch: string;
    // same project / local / logger / git-lock inputs a dedicated run uses to build RunLumpInput
}): Promise<LineScore>;
```

Contract:

| Result | Rule |
| --- | --- |
| Never throws to collect | Map Failure / throw → `{ kind: 'failed' }` |
| Build | `jsConfigToRunLumpInput` with that `effectiveDiscoveryBranch`, then core `getToDoContextList` (CLI locked `refreshRemoteTrackingRefsFn`, same as a run) |
| `{ kind: 'empty' }` | Success and zero eligible todos |
| `{ kind: 'scored', value }` | Success and at least one eligible todo; `value` = min of each todo priority using the same `or 0` missing-priority rule as `getToDoContextList` |
| `{ kind: 'failed' }` | Config/todo/status Failure or throw |

Collect logs `logger.warn` on `failed` (lump name + scan branch + reason). Do not drop the line.

Score **while the scan-branch discovery preflight still holds the execution-path lock** and the checkout is that `scanBranch`. Today `discoverDedicatedLumpsForScanBranch` uses `holdForRun: false` and releases the lock on return. **Forbidden:** scoring after that return (tree can move). Extend that helper with an in-lock hook after matched `LoadableLump[]` are known, or keep match + score in one `preflightDiscoveryBranchWithLock` `fn`. Matching/allowlist rules stay in `discoverDedicatedLumpsForScanBranch`; do not duplicate them in collect.

Path lock then git-common-dir lock for the status refresh (existing order). Do not nest a second path lock.

### Tick log and docs

The existing dedicated line

`tick N — running K lump(s)… [name@branch, …]`

lists items **after** reorder. Score failures do not add a second tick summary. Short note in `concepts.md` next to the shared-cap sentence: dedicated multi-line lumps are run in best eligible-todo-priority order within each `lumpName` (tie = scan order); the cap is still lump-wide.

## Technical approach

| Step | Change |
| --- | --- |
| 1. Types + reorder util | Add `packages/apps/cli/src/utils/reorderRunLumpQueueByLineScore/` (`main.ts`, `index.ts`, `unit.test.ts`). Barrel-export from `utils/index.ts`. Pure; no git. |
| 2. Score util | Add `packages/apps/cli/src/utils/scoreDedicatedLumpLine/` the same way. Only this module calls `jsConfigToRunLumpInput` + `getToDoContextList` for **tick ranking**. |
| 3. In-lock score | `discoverDedicatedLumpsForScanBranch` (or collect’s single lock scope) runs `scoreDedicatedLumpLine` per include/exclude-matched lump **inside** the discovery `fn`. Collect builds `ScoredRunLumpQueueItem[]`. |
| 4. Reorder then run | After all scan branches, `reorderRunLumpQueueByLineScore`, then today’s `runLumpQueueWithConcurrency`. Shared collect: no score, no reorder. |
| 5. Docs | `concepts.md` branch-resolution / cap paragraph only. No `run` / `lump-plan` pages. |

### Affected surfaces

| Surface | Role |
| --- | --- |
| `utils/reorderRunLumpQueueByLineScore/` | **Owner** of slot-stable order |
| `utils/scoreDedicatedLumpLine/` | **Owner** of `LineScore` |
| `utils/discoverDedicatedLumpsForScanBranch/` | In-lock hook (or equivalent one lock scope) so score sees the scan-branch tree |
| `utils/launchStartDaemon/runForeground.ts` `collectTickLumps` | Wire score → reorder → existing queue; tick label from reordered items |
| `utils/runLumpQueueWithConcurrency/` | Unchanged |
| `utils/runLumpFromLumpName/` | Unchanged |
| `packages/apps/cli/DOCS/concepts.md` | Line-order + shared cap |

## Testing strategy

| Level | Coverage |
| --- | --- |
| Unit `reorderRunLumpQueueByLineScore` | Slot-stable example (`backlog@dev` 10, `other@dev`, `backlog@feature` 3 → feature, other, dev). Ties keep input order. Empty after scored. Failed frozen. Mixed `lumpName`s. Identity when all empty or all failed. |
| Unit `scoreDedicatedLumpLine` | Non-empty todos → `scored` with min using the same missing-priority rule as `getToDoContextList` (missing beats `1`). Empty list → `empty`. `jsConfigToRunLumpInput` / `getToDoContextList` Failure → `failed`, no throw. |
| Start `commands/start/testing/multiDiscoveryBranches.unit.test.ts` | Discovery scan order **unchanged**. **Run** order for one lump on two lines follows better todo priority, not primary first. Shared-mode tests: no reorder. Existing spies that assume run order = scan order must expect the new order when fixtures have distinct priorities. |
| E2E | Not required unless an existing dedicated multi-primary E2E asserts run order. |

Do not add a second reorder/score helper in `runForeground` or command modules.

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/cli/DOCS/concepts.md` | After the sentence that the cap is per `lumpName` across lines: dedicated ticks order that lump’s scan lines by best eligible todo priority (lower first; equal → expand/scan order). `lumpcode run` is still one concrete discovery line. |

## Acceptance criteria

1. Dedicated tick with one lump on `dev` (best eligible todo priority 10) and `feature/<x>` (best 3), `maximumNumberOfConcurrentBranches: 1`: the feature line is invoked first; `dev` still runs afterward and may skip `tooManyOpenBranches`.
2. Same lump, equal best priorities: run order among those lines matches pre-reorder collect/scan order.
3. A third lump on `dev` sitting between the two lines stays between them after reorder (slot-stable).
4. Shared-mode ticks do not call scoring/reorder; queue stays name-only as today.
5. `lumpcode run` / `lump-plan` behavior and flags unchanged.
6. Score failure: warn, line remains in its slot and is still invoked; other scored lines of that lump still reorder.
7. Empty todo line: after scored lines of that lump; does not consume the cap by itself.
8. Tick `running … [… ]` label matches the reordered dedicated queue.
9. No context allowlist and no second cap check outside `evaluateTooManyOpenBranchesSkip`.
10. No duplicate min-priority / slot-stable logic outside `scoreDedicatedLumpLine` and `reorderRunLumpQueueByLineScore`.
