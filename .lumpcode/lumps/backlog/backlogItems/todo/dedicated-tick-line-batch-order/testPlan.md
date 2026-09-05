# Test plan: dedicated-tick-line-batch-order

| Field | Value |
| --- | --- |
| **Backlog** | `dedicated-tick-line-batch-order` |
| **Kind** | Feature — dedicated tick scores leftover `runLump` batches, slot-fills repeats, same-line pool serialize |
| **Primary packages under test** | `@lumpcode/cli` only (`packages/apps/cli`) |
| **Not under test** | `@lumpcode/core` `getToDoContextList` / `runLump`; `@lumpcode/recipes`; `lumpcode run` / `lump-plan`; shared collect; cap gate; docs prose (implementation checklist) |

Source of truth: [requirements.md](./requirements.md). This plan is the source of truth for the `testImpl` stage.

---

## 1. Goals of the test suite

Prove that after implementation:

1. `LineScore` for a non-empty todo list is `{ kind: 'scored'; values: number[] }` — one entry per leftover `runLump` batch: `values[i] = options.priority || 0` of already-sorted `todos[i * n]`, `n = max(1, numberOfContextsPerBranch)`. Scalar `value` is gone.
2. Omit / `n < 1` on a ready snapshot is treated as `1`. Snapshot carries `numberOfContextsPerBranch` from that line’s `RunLumpInput`; spies may omit it.
3. Empty todo list → `{ kind: 'empty' }`. Score Failure / throw → `{ kind: 'failed'; reason }`. Score does not re-sort todos.
4. `reorderDedicatedLumpLines` still returns one row per collect row. Per `lumpName`, failed rows stay frozen; non-failed rows fill from the merged batch stream (a line may repeat); leftover slots take unused lines, scored before empty, collect order inside each group. Other `lumpName`s keep their indices.
5. `runLumpLinesWithConcurrency` never starts a second invoke with the same `lumpName` + `effectiveDiscoveryBranch` (empty string when omitted) while one is in flight. Unique-key queues keep today’s start order, cap, and failure isolation. Different discovery lines of the same lump may overlap.
6. Dedicated start still scores/reorders; shared start does not. Tick `running K lump(s)… [name@branch, …]` lists the reordered rows (repeats allowed). One-batch scores still pick the better line first.

Docs / `concepts.md` wording is **implementation-stage acceptance**, not automated in `testImpl`.

---

## 2. Testing approach

| Level | Required? | Mechanism |
| --- | --- | --- |
| **Unit (`scoreDedicatedLumpLine`)** | Yes — batch list + `values` | Existing snapshot/score suite; mock `getToDoContextList` with **already-sorted** todos |
| **Unit (`reorderDedicatedLumpLines`)** | Yes — slot fill + repeats | Pure fixtures; no git |
| **Unit (`runLumpLinesWithConcurrency`)** | Yes — same-key serialize | Existing deferred-gate workers; keep P1–P6 live |
| **Start (`multiDiscoveryBranches`)** | Yes — spy shape + one-batch order + `[B, B]` tick | Existing foreground harness; spy snapshot/score/`runLumpFromLumpName` |
| **E2E** | No | Requirements: not required |

### Prefer update over new

| Host (today) | Becomes |
| --- | --- |
| `scoreDedicatedLumpLine/unit.test.ts` — `{ kind: 'scored', value: n }` | `{ kind: 'scored', values: [n] }` for one-batch fixtures; add **S\*** batch / omit / no-resort cases |
| `reorderDedicatedLumpLines/unit.test.ts` — scalar `value` | Same cases with `values: [n]`; add **R\*** stream / leftover / repeat cases |
| `runLumpLinesWithConcurrency/unit.test.ts` — P1–P6 | Keep as-is (unique keys). Add **K\*** same-key serialize |
| `commands/start/testing/multiDiscoveryBranches.unit.test.ts` — `value: 10` / `value: 3` | `values: [10]` / `values: [3]`; add **T2** repeat-row tick |

### Red → green during `testImpl` (skip new and updated)

1. Write/extend all cases against the **post-implementation** contract.
2. Mark **every updated or new case for this item** with `it.skip` / `describe.skip` during `testImpl` so the suite stays green while product code is unchanged.
3. Do **not** change production types or add a `batchScores` stub in `testImpl`. Chunking is asserted through `scoreDedicatedLumpLine` / `scoreDedicatedLumpLineSnapshots`.
4. Typecheck: `toEqual` on `values` is fine. Reorder fixtures that construct `LineScore` must cast (`as ScoredLumpLine['lineScore']` or a test-local helper) until implementation replaces `value` with `values`.
5. Leave **unchanged** cases live: snapshot HEAD / jsConfig failures; `{ kind: 'empty' }` / `{ kind: 'failed' }`; P1–P6; shared-mode “does not score/reorder”; `run` / `lump-plan` suites.
6. During **implementation**, unskip as behavior lands. Do not leave updated hosts permanently skipped.

### Do not re-sort in score tests

`getToDoContextList` already sorts by `options.priority || 0`. Mocks must return that order except **S4** (proves score does not re-sort). Score / collect must not compute a second batch list.

---

## 3. File layout (implementation details)

| Path | Role |
| --- | --- |
| `packages/apps/cli/src/utils/scoreDedicatedLumpLine/unit.test.ts` | **Update** — **S\*** |
| `packages/apps/cli/src/utils/reorderDedicatedLumpLines/unit.test.ts` | **Update** — existing scalar → `values: [n]`; **R\*** |
| `packages/apps/cli/src/utils/runLumpLinesWithConcurrency/unit.test.ts` | **Update** — add **K\*** only; P1–P6 stay |
| `packages/apps/cli/src/commands/start/testing/multiDiscoveryBranches.unit.test.ts` | **Update** — spy `values`; **T1** stay (one-batch); add **T2** |

No new util directory. `runForeground.ts` stays a caller. `batchScores` is owned by `scoreDedicatedLumpLine` at implementation; tests do not import it in `testImpl`.

Run:

```bash
npm run test -w=@lumpcode/cli
```

---

## 4. Shared test data / fixtures

All **A / B / C** aliases below are discovery lines of the **same** `lumpName` (`backlog`) unless a case says otherwise. Collect order is the listed order.

### 4.1 Todo helper

```ts
function todos(...priorities: Array<number | undefined>): Context[] {
  return priorities.map((priority, i) => ({
    name: `c${i}`,
    variables: {},
    ...(priority === undefined ? {} : { options: { priority } }),
  }));
}
```

Missing `options.priority` is `|| 0` (same rule as core). Pass **sorted** lists into `getToDoContextList` mocks except **S4**.

### 4.2 Ready snapshot

Reuse `readySnapshot` in `scoreDedicatedLumpLine/unit.test.ts`. Allow `numberOfContextsPerBranch?: number` on the override bag (extra field is enough; do not change the production type in `testImpl`).

| Snapshot field | Score uses |
| --- | --- |
| `numberOfContextsPerBranch` omitted | `n = 1` |
| `0` or negative | `n = 1` |
| `2` | `n = 2` |

`snapshotDedicatedLumpLine` (real, not spy) copies `numberOfContextsPerBranch` from the `jsConfigToRunLumpInput` success payload. Default mock payload may omit it.

### 4.3 Score / reorder helper

```ts
function scored(
  lumpName: string,
  branch: string,
  lineScore:
    | { kind: 'scored'; values: number[] }
    | { kind: 'empty' }
    | { kind: 'failed'; reason: string },
): ScoredLumpLine {
  return {
    lumpName,
    effectiveDiscoveryBranch: branch,
    lineScore: lineScore as ScoredLumpLine['lineScore'],
  };
}
```

### 4.4 Story fixtures (requirements use cases)

`n = 2` unless noted. `values` are what score must emit; reorder input uses those `values` directly.

| ID | Lines (collect order) | Sorted todo priorities | `values` | Reorder (that lump’s rows) |
| --- | --- | --- | --- | --- |
| Story 1 | B `feature/b`, A `feature/a` | B `1,2,3` · A `10,11,12` | B `[1, 3]` · A `[10, 12]` | `[B, B]` |
| Story 2 | A, B | A `1,2,5,6` · B `3,4,7,8` | A `[1, 5]` · B `[3, 7]` | `[A, B]` |
| Story 3 | B, A, C | B `1` · A `10,12` · C empty | B `[1]` · A `[10, 12]` · C `empty` | `[B, A, A]` |
| Story 4 | B, A, C | B `1` · A empty · C empty | B `[1]` · A/C `empty` | `[B, A, C]` |
| Story 5 | A, B | A `5,6` · B `5,8` (`n = 1` or already-chunked) | A `[5, 6]` · B `[5, 8]` | `[A, B]` |
| Story 6 | `backlog@dev`, `other@dev`, `backlog@feature` | one-batch `10` / `1` / `3` | `values: [10]`, `[1]`, `[3]` | `[backlog@feature, other@dev, backlog@dev]` |
| Story 7 | A scored, F failed, B scored (multi-batch) | see **R7** | — | failed index frozen |

### 4.5 Pool gates

Reuse `makeGate` + the local `viWaitFor` already in `runLumpLinesWithConcurrency/unit.test.ts`. Identify duplicate rows by index or a test-only label; `LumpLine` itself has only `lumpName` + `effectiveDiscoveryBranch`.

```ts
const line = (lumpName: string, effectiveDiscoveryBranch?: string) =>
  effectiveDiscoveryBranch === undefined
    ? { lumpName }
    : { lumpName, effectiveDiscoveryBranch };
```

Key under test: `lumpName` + (`effectiveDiscoveryBranch` ?? `''`).

### 4.6 Start harness

Reuse `makeStartHandler` + `setupStartTestRepo` / `writeMinimalLump` / `createIntegrationBranch` from `packages/apps/cli/src/commands/start/testing/`. Snapshot spies may omit `numberOfContextsPerBranch`.

---

## 5. Test cases

Each case: **ID**, **setup/data**, **expectation**, **where**.

### 5.1 Score batch list (**S**)

Canonical owner: `scoreDedicatedLumpLine`. Assert through `scoreDedicatedLumpLineSnapshots` + `readySnapshot` unless noted.

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| S1 | Empty | `getToDoContextList` → `success([])` | `{ kind: 'empty' }` (keep today’s test live if unchanged) |
| S2 | `n = 1` / omit | Snapshot omits `numberOfContextsPerBranch`; todos `todos(1, 2, 5)` | `{ kind: 'scored', values: [1, 2, 5] }` |
| S3 | `n = 2` packed | Snapshot `numberOfContextsPerBranch: 2`; todos `todos(1, 2, 5, 6)` | `{ kind: 'scored', values: [1, 5] }` |
| S4 | Does not re-sort | Snapshot omit / `n = 1`; mock returns `todos(5, 1)` (unsorted) | `{ kind: 'scored', values: [5, 1] }` — not `[1, 5]` |
| S5 | `n < 1` | `numberOfContextsPerBranch: 0` and `-2`; todos `todos(4, 8)` | Both → `values: [4, 8]` |
| S6 | Partial last batch | `n = 2`; todos `todos(1, 2, 5)` | `values: [1, 5]` (`todos[0]`, `todos[2]`) |
| S7 | Missing priority `\|\| 0` (one batch) | Omit `n` or `n` ≥ list length; one todo with no `priority` | `{ kind: 'scored', values: [0] }` |
| S8 | Explicit one-batch min | One todo `priority: 3`, or sorted `todos(3, 10)` with `n >= 2` | `{ kind: 'scored', values: [3] }` |
| S9 | Failure | `getToDoContextList` → `failure({ message: 'status boom' })` | `{ kind: 'failed', reason: 'status boom' }` (keep live) |
| S10 | Throw | `getToDoContextList` rejects `Error('unexpected')` | `{ kind: 'failed', reason: 'unexpected' }` (keep live) |
| S11 | Frozen list injection | Ready snapshot `contextList` of one todo `priority: 4`; mock returns that list | `values: [4]`; injected `getContextListFn` returns the frozen list (update of today’s `value: 4`) |
| S12 | Shared refresh | Two ready snapshots; locked refresh once | Items keep `values: [10]` / `values: [3]` (update of today’s `value` asserts) |
| S13 | Snapshot copies `n` | `jsConfigToRunLumpInput` success includes `numberOfContextsPerBranch: 2` | `snapshotDedicatedLumpLine` ready result has `numberOfContextsPerBranch: 2` |
| S14 | Failed refresh still scores | Injected refresh Failure; todos `todos(2)` | `{ kind: 'scored', values: [2] }` (update of today’s `value: 2`) |

**Where:** `packages/apps/cli/src/utils/scoreDedicatedLumpLine/unit.test.ts`.

Map today’s tests:

| Today | After |
| --- | --- |
| `returns scored with min priority using \|\| 0` | **S7** (`values: [0]`) |
| `returns scored with the minimum among explicit priorities` | **S8** |
| `returns empty when todo list is empty` | **S1** (live) |
| `returns failed when getToDoContextList fails` / `throws` | **S9** / **S10** (live) |
| `classifies the frozen context list…` | **S11** |
| `refreshes once then reuses…` | **S12** |
| `injects a failed refresh…` | **S14** |

HEAD / jsConfig / rev-parse snapshot failures stay live and must not call `getToDoContextList`.

### 5.2 Slot-stable batch reorder (**R**)

Output **length always equals input length**. Compare `DedicatedLumpLine[]` only (no `lineScore` on the result).

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| R1 | Repeat stronger line (story 1) | B `values: [1, 3]`, A `values: [10, 12]` | `[B, B]` |
| R2 | Packed batches (story 2) | A `[1, 5]`, B `[3, 7]` | `[A, B]` |
| R3 | Leftover consumed by repeat (story 3) | B `[1]`, A `[10, 12]`, C `empty` | `[B, A, A]` — C appears zero times in the taken prefix and is dropped this tick |
| R4 | Leftover empties (story 4) | B `[1]`, A `empty`, C `empty` | `[B, A, C]` |
| R5 | Tie uses collect index (story 5) | Collect A then B; A `[5, 6]`, B `[5, 8]` | `[A, B]` (`A@5` beats `B@5` on `collectIndex`) |
| R6 | Other lump stays (story 6) | `backlog@dev` `[10]`, `other@dev` `[1]`, `backlog@feature` `[3]` | `[backlog@feature, other@dev, backlog@dev]` |
| R7 | Failed frozen; repeats among remaining | A `[10, 12]`, mid `failed`, B `[1, 3]` | `[B, mid, B]` — failed index unchanged; movable slots fill `B@1`, `B@3` |
| R8 | Existing scalar swap | Same as today’s first case with `values: [10]`, `[1]`, `[3]` | Same three-row result as today |
| R9 | Existing ties / empty-after-scored / mixed names / all-empty / all-failed / `[]` | Today’s fixtures with `value: n` → `values: [n]` | Same results as today |
| R10 | One row, many batches | Single line `values: [1, 5, 9]` | Identity (`[that line]`); extra batches do not grow the list |
| R11 | Repeat then leftover empty | B `[1, 2]`, A `empty`, C `empty` (3 rows) | `[B, B, A]` — taken `[B, B]`; one leftover slot; unused empties in collect order |

**Where:** `packages/apps/cli/src/utils/reorderDedicatedLumpLines/unit.test.ts`.

Stream rule to encode in R1–R5 / R7 / R11 (do not reimplement in collect): flatten `{ line, collectIndex, batchIndex, score }` from each `scored.values`; sort by `score` ascending, then `collectIndex`, then `batchIndex`; fill that lump’s non-failed indices from the front (repeats allowed). Unused leftover indices: lines that appear **zero** times in that taken prefix, **scored before empty**, collect order inside each group.

### 5.3 Same-line pool serialize (**K**)

Keep **P1–P6** live (unique `lumpName`s, omitted branch). They prove unique-key start order, cap, drain, and failure isolation still hold.

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| K1 | Duplicate same branch | `concurrency: 2`, items `[B@dev, B@dev]`, both gated | Peak in-flight for that key is `1`; `started.length === 1` until the first gate resolves; then the second `runLumpLine` starts; pool resolves after both |
| K2 | Different line overlaps | `concurrency: 2`, items `[B@dev, A@feature]` (or `[B@dev, other@dev]`), both gated | Both start before either finishes (peak `2`) |
| K3 | Same lump, different branch | `concurrency: 2`, items `[B@dev, B@feature]` | Both start before either finishes (do **not** serialize across discovery lines) |
| K4 | Omitted branch key | `concurrency: 2`, items `[{ lumpName: 'B' }, { lumpName: 'B' }]` | Same as K1 (key is `B` + `''`) |
| K5 | Failure then sibling | `concurrency: 2`, `[B@dev, B@dev]`; first `throw` or return Failure | Second still starts **after** the first settles; pool promise resolves (isolation unchanged) |

**Where:** `packages/apps/cli/src/utils/runLumpLinesWithConcurrency/unit.test.ts`.

Do **not** require skip-ahead past a blocked duplicate to a later unique key. K2/K3 cover “a different line can start while `B` is in flight” with that different line at the queue head. P4/P4b stay the unique-key isolation proofs.

### 5.4 Dedicated start wiring (**T**)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| T1 | One-batch better line first | Today’s `multiLine` on `main` + `feature/a`; score spy `main` → `values: [10]`, other → `values: [3]` | `runLumpFromLumpName` for `multiLine` is `['feature/a', 'main']`; tick log contains `multiLine@feature/a` (update of today’s `value` spy — same run order) |
| T2 | Repeat occupies both collect rows | Same two-line lump; score spy `feature/a` → `values: [1, 3]`, `main` → `values: [10, 12]` | Two `multiLine` runs, both `effectiveDiscoveryBranch: 'feature/a'`; tick log lists `multiLine@feature/a` twice (or the reordered `[name@branch, …]` fragment contains that pair) |
| T3 | Shared does not score/reorder | Today’s S1 shared `primaryBranches` fixture | `snapshotDedicatedLumpLine` / `scoreDedicatedLumpLineSnapshots` / `reorderDedicatedLumpLines` not called (keep live) |

**Where:** `packages/apps/cli/src/commands/start/testing/multiDiscoveryBranches.unit.test.ts`.

Snapshot spy in T1/T2 may omit `numberOfContextsPerBranch`. Do not add `run` / `lump-plan` cases.

---

## 6. Existing tests that must change

| Location | ID | Change |
| --- | --- | --- |
| `packages/apps/cli/src/utils/scoreDedicatedLumpLine/unit.test.ts` | S2–S8, S11–S14 | `value` → `values`; add batch / omit / no-resort; `it.skip` those in `testImpl` |
| `packages/apps/cli/src/utils/reorderDedicatedLumpLines/unit.test.ts` | R8–R9 + R1–R7, R10–R11 | Scalar fixtures → `values: [n]`; add stream/leftover/repeat; skip updated + new |
| `packages/apps/cli/src/utils/runLumpLinesWithConcurrency/unit.test.ts` | K1–K5 | Add only; `it.skip` new. P1–P6 unchanged and live |
| `packages/apps/cli/src/commands/start/testing/multiDiscoveryBranches.unit.test.ts` | T1, T2 | Spy `values` not `value`; add T2 repeat tick; skip T1 (updated) + T2. T3 live |

Leave `run` / `lump-plan` / core `getToDoContextList` suites alone.

---

## 7. Out of scope (explicit)

| Item | Why |
| --- | --- |
| Growing collect to one row per leftover batch (`[B, B, A, A]` in one tick) | Parked `tick-line-slot-count` |
| Changing core sort / `\|\| 0`, or `runLump` draining more than one batch per invoke | Non-goal |
| Per-`(lumpName, discoveryLine)` caps, context allowlists, packing todos across lines | Non-goal |
| Global sort across different `lumpName`s | Non-goal |
| Serializing A vs B (different discovery lines) | Non-goal (K3 asserts they **may** overlap) |
| New CLI flags, website copy, E2E | Non-goal |
| `concepts.md` markdown snapshot | Implementation checklist |
| Second `batchScores` / same-key gate outside the three owners | Review checklist, not a unit |

---

## 8. Acceptance mapping

| Requirements acceptance | Covered by |
| --- | --- |
| Two lines, `n = 2`, B `1,2,3` / A `10,11,12` → reorder `[B, B]` | S3/S6 + R1, T2 |
| Packed A `1,2,5,6` / B `3,4,7,8` → scores `[1, 5]` / `[3, 7]`; reorder `[A, B]` | S3, R2 |
| Output length = collect length; failed rows do not move | Every **R\***; R7, R9 failed |
| Third lump between two lines of L keeps its index | R6 |
| Shared ticks do not score or reorder | T3 |
| `lumpcode run` / `lump-plan` unchanged | No new cases; existing suites stay live |
| Concurrency > 1: same `lumpName` + `effectiveDiscoveryBranch` never overlap | K1, K4, K5 |
| Tick label matches reordered list (repeats allowed) | T1, T2 |
| `concepts.md` describes batch order, not scalar min | §10 |
| No second batch-list or same-key gate outside the three owners | §10 |

---

## 9. Commands to run

```bash
npm run test -w=@lumpcode/cli
```

Focus during red/green:

```bash
npm run test -w=@lumpcode/cli -- src/utils/scoreDedicatedLumpLine/unit.test.ts
npm run test -w=@lumpcode/cli -- src/utils/reorderDedicatedLumpLines/unit.test.ts
npm run test -w=@lumpcode/cli -- src/utils/runLumpLinesWithConcurrency/unit.test.ts
npm run test -w=@lumpcode/cli -- src/commands/start/testing/multiDiscoveryBranches.unit.test.ts
```

---

## 10. Implementation-stage checklist (not automated here)

- [ ] `LineScore` drops `value`; scored form is `values: number[]`
- [ ] `batchScores` (or equivalent) lives only in `packages/apps/cli/src/utils/scoreDedicatedLumpLine/`; collect / reorder / `runForeground` do not chunk todos
- [ ] Ready snapshot carries `numberOfContextsPerBranch` from `RunLumpInput`; omit → `1`
- [ ] `reorderDedicatedLumpLines` fills from the merged batch stream; output length = input length
- [ ] Same-key gate lives only in `packages/apps/cli/src/utils/runLumpLinesWithConcurrency/`
- [ ] Tick log uses the reordered list (repeats allowed)
- [ ] `packages/apps/cli/DOCS/concepts.md`: replace the “best eligible-todo-priority order” sentence with batch order (every `numberOfContextsPerBranch`-th sorted eligible-todo priority), a line may occupy more than one of that lump’s collect rows, same line is sequential in the pool, cap still lump-wide
- [ ] All `it.skip` / `describe.skip` for this item unskipped and green
