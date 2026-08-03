# Test plan: parallel-global-daemon-worktree

| Field | Value |
| --- | --- |
| **Backlog** | `parallel-global-daemon-worktree` |
| **Kind** | Feature — global-daemon work-queue parallelism (`maxParallelRun` + worktree), `ignoredByGlobalDaemon`, meta `inFlightLumpCount` (replace `busy`) |
| **Primary packages under test** | `@lumpcode/cli` only (`packages/apps/cli`) |
| **Not under test** | `@lumpcode/core`; `@lumpcode/recipes`; parallel contexts within one lump; parallel per-lump daemons; live agents; new CLI flags; docs/schema prose content (implementation checklist) |

Source of truth: [requirements.md](./requirements.md). This plan is the source of truth for the `testImpl` stage.

---

## 1. Goals of the test suite

Prove that after implementation:

1. `local.json` accepts optional `maxParallelRun` (positive integer, default `1`); invalid values fail parse / fail `lumpcode start` with a clear message.
2. Global daemon (`start` without `--lumpName`) with `workspaceStrategy: 'worktree'` runs up to `N = min(maxParallelRun, eligibleCount)` lumps concurrently within a tick; the tick `await`s until the queue drains.
3. Global daemon with `checkout` stays sequential regardless of `maxParallelRun` (optional once-log when `maxParallelRun > 1`).
4. Per-lump daemon (`start --lumpName`) ignores `maxParallelRun` (one lump per tick).
5. Dedicated multi-`primaryBranches` builds **one** merged tick queue (not per-branch sequential pools), then runs the pool.
6. `ignoredByGlobalDaemon: true` lumps are omitted from the global queue; startup logs ignored names once; per-lump daemon and manual `run` still invoke them; `validateDaemonLaunch` still validates them.
7. Writers stop emitting `busy`; maintain `inFlightLumpCount` (0 idle; increment before each `runLumpFromLumpName`, decrement in `finally`); parallel ticks can show count > 1 without lost updates.
8. Readers treat mid-run as `(inFlightLumpCount ?? 0) >= 1 || busy === true`. Default `stop` **refuses** when mid-run (message mentions `--force`; `--json` code `daemonBusy`); idle stop and `--force` still succeed; legacy `busy: true` still refuses.
9. One lump failure does not cancel in-flight siblings or prevent starting remaining queued lumps.
10. `daemon-status` surfaces `inFlightLumpCount` (no new `busy` writes); E2E `waitForDaemonIdle` uses the new mid-run predicate with legacy fallback.

Docs / `lumpConfig.schema.json` / `localConfig.schema.json` updates are **implementation-stage acceptance**, not automated in `testImpl`.

---

## 2. Testing approach

| Level | Required? | Mechanism |
| --- | --- | --- |
| **Unit (pool util)** | Yes — primary for concurrency math | Pure deferred-promise workers; no git/daemon |
| **Unit / integration (CLI)** | Yes — primary for start/stop/meta/local | Existing start/stop/readLocalConfig/readDaemonMeta fixtures; spy `runLumpFromLumpName`; real temp git projects |
| **E2E scenarios** | No new cases | Update `waitForDaemonIdle` so existing e2e stays green; do not add agent-backed parallel e2e |

### Prefer spies + deferred gates over real agents

Match `packages/apps/cli/src/commands/start/testing/daemonInFlightMeta.unit.test.ts` (in-flight meta): spy `runLumpFromLumpName` with deferred promises, release in controlled order, poll meta / call counts. Do **not** run real presets/agents.

### Prefer update over new when a host exists

| Host (today) | Becomes |
| --- | --- |
| `readLocalConfig/unit.test.ts` — workspaceStrategy / disabled cases | Extend with **L*** (`maxParallelRun`) |
| `readDaemonMeta/unit.test.ts` — `busy` read cases | Extend/rewrite for **M*** (`inFlightLumpCount` + legacy `busy`) |
| `start/testing/` — “daemon busy meta toggle” | Rewrite to **M*** / **G*** (`inFlightLumpCount`, parallel windows) |
| `start/testing/` — “runs lumps in discovery-branch scan order…” | Keep order asserts where still valid; add merged-queue + pool cases (**G5**) |
| `stop/unit.test.ts` — mid-run / ST1–ST10 busy cooperative cases | Rewrite mid-run path to **refuse** (**K***) per this item; keep idle / `--force` kill coverage |
| `restart/unit.test.ts` — “cooperatively stops a busy daemon…” | Rewrite for mid-run refuse via stop (**K5**) |
| `daemon-status/unit.test.ts` | Add **D*** surface of `inFlightLumpCount` |
| `e2e/harness/daemonHelpers.ts` — `waitForDaemonIdle` | **Update** mid-run detection (**E1**) |

### Red → green during `testImpl` (skip both new and updated)

1. Write/extend all cases against the **post-implementation** contract.
2. Mark **every** case for this item with `it.skip` / `describe.skip` during `testImpl` — both **new** tests **and** **updated** hosts — so the suite stays green while product code is unchanged.
3. Add index-barrel-exported stubs (throwing `not implemented`) for any new util (e.g. `runLumpQueueWithConcurrency`) so imports compile and pool tests run red once unskipped.
4. During **implementation**, unskip as behavior lands (or unskip all when complete). Do not leave updated hosts permanently skipped.

---

## 3. File layout (implementation details)

| Path | Role |
| --- | --- |
| `packages/apps/cli/src/utils/runLumpQueueWithConcurrency/{main,index,unit.test}.ts` | **Add** — reusable pool; **P*** cases. Stub in `testImpl` (`throw new Error('not implemented')`), barrel from `utils/index.ts` |
| `packages/apps/cli/src/utils/readLocalConfig/unit.test.ts` | **Update** — **L1–L6** |
| `packages/apps/cli/src/utils/readDaemonMeta/{main,unit.test}.ts` | **Update** — schema + **M1–M4** reads |
| `packages/apps/cli/src/commands/start/testing/daemonInFlightMeta.unit.test.ts` + `parallelGlobalDaemon.unit.test.ts` | **Update** busy-meta → in-flight; parallel / ignored / checkout / per-lump (**G***, **I***, **C***, **S***) |
| `packages/apps/cli/src/commands/stop/unit.test.ts` | **Update** mid-run refuse (**K1–K4**); adjust ST* that assumed cooperative busy SIGTERM |
| `packages/apps/cli/src/commands/restart/unit.test.ts` | **Update** busy restart (**K5**) |
| `packages/apps/cli/src/commands/daemon-status/unit.test.ts` | **Add** **D1–D2** |
| `packages/apps/cli/src/utils/validateDaemonLaunch/unit.test.ts` | **Add** **V1** (ignored lump still validated) |
| `packages/apps/cli/src/e2e/harness/daemonHelpers.ts` | **Update** `waitForDaemonIdle` (**E1**) — no new e2e scenario file required |

Optional small helper (only if start tests get noisy): private filter helper covered via start cases, not a new util directory.

Run:

```bash
npm run test -w=@lumpcode/cli
```

---

## 4. Shared test data / fixtures

### 4.1 Local config fragments

```json
{
  "mode": "dedicated",
  "primaryBranch": "main",
  "workspaceStrategy": "worktree",
  "maxParallelRun": 3
}
```

Invalid `maxParallelRun` samples (each must fail `readLocalConfig` / start): `0`, `-1`, `1.5`, `"2"`, `null`, `true`, `{}`.

Omit field → effective concurrency `1`.

### 4.2 Minimal lump configs

Reuse `writeMinimalLump` / helpers from `start/testing/testHelpers.ts`. Variants:

```json
{ "...existing...", "ignoredByGlobalDaemon": true }
```

```json
{ "...existing...", "disabled": true }
```

Do **not** treat `ignoredByGlobalDaemon` as dynamic (boolean only).

### 4.3 Deferred `runLumpFromLumpName` spy (parallel proofs)

```ts
type Gate = { resolve: () => void; promise: Promise<void> };
function makeGate(): Gate {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { resolve, promise };
}

const started: string[] = [];
const inFlightPeaks: number[] = [];
// mockImplementation: push lumpName to started; await gate; return success({ skipped: false, result: {...} })
```

Assert concurrency by counting unresolved gates (or meta `inFlightLumpCount`) while N gates are open.

### 4.4 Foreground start harness

Reuse `makeStartHandler` + `setupStartTestRepo` from `start/testing/testHelpers.ts`. Commit/push lump configs so dedicated discovery sees them.

### 4.5 Mid-run stop meta

Write meta files with:

- `{ inFlightLumpCount: 2, cronSetup, workspaceStrategy }` — mid-run
- `{ inFlightLumpCount: 0, … }` — idle
- `{ busy: true, … }` — legacy mid-run (no `inFlightLumpCount`)
- `{ busy: false, inFlightLumpCount: 0 }` — idle even if legacy key present

Alive PID via existing `aliveDaemonSpawn` / start-then-stop patterns in `stop/unit.test.ts`.

### 4.6 Pool unit callback

```ts
await runLumpQueueWithConcurrency({
  lumpNames: ['a', 'b', 'c', 'd'],
  concurrency: 2,
  runOneLump: async ({ lumpName }) => { /* record + await gate */ },
});
```

---

## 5. Test cases

Each case: **ID**, **setup/data**, **expectation**, **where**.

### 5.1 `maxParallelRun` validation (**L** — update `readLocalConfig`)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| L1 | Omit field | Valid local.json without `maxParallelRun` | `success`; parsed config has no required field **or** defaults to `1` at consumer — either way start treats concurrency as `1` (assert via start **G3** if parse omits) |
| L2 | Accept positive int | `maxParallelRun: 3` (+ worktree) | `success`; `data.maxParallelRun === 3` |
| L3 | Reject `0` | `maxParallelRun: 0` | `success: false`; message mentions `maxParallelRun` / positive |
| L4 | Reject negative | `maxParallelRun: -2` | Failure; clear message |
| L5 | Reject float / non-number | `1.5`, `"2"`, `true` | Failure each |
| L6 | Accept `1` explicitly | `maxParallelRun: 1` | Success; value `1` |

**Where:** `packages/apps/cli/src/utils/readLocalConfig/unit.test.ts` (`it.skip` until implementation).

If validation is deferred to `start` instead of `readLocalConfig`, move L3–L5 to `start/testing/` and keep L1–L2 on parse; prefer validating in `readLocalConfig` per requirements technical approach.

### 5.2 Concurrency pool util (**P** — new)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| P1 | Cap concurrency | 4 names, `concurrency: 2`, all gated | Never more than 2 `runOneLump` in flight; after releasing 1, third starts; all 4 eventually run; function resolves only after all settle |
| P2 | `concurrency` ≥ length | 3 names, `concurrency: 5` | All 3 start before any finish (peak === 3) |
| P3 | `concurrency: 1` | 3 names | Strictly sequential starts (second starts only after first resolves) |
| P4 | Failure isolation | Second lump `throw` or return Failure-like; others gated success | Remaining lumps still invoked; pool promise settles (does not reject-cancel siblings — match start’s log-and-continue contract; if util swallows, document; start **G6** is the integration proof) |
| P5 | Empty list | `lumpNames: []` | Resolves immediately; `runOneLump` never called |
| P6 | Preserve order of *start attempts* | Names `['a','b','c']`, concurrency 2 | First two started are `a` then `b` (queue head order); `c` starts after a slot frees |

**Where:** `packages/apps/cli/src/utils/runLumpQueueWithConcurrency/unit.test.ts` (new; `describe.skip` / stub main until implementation).

### 5.3 Global daemon parallel tick (**G** — start)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| G1 | Worktree + `maxParallelRun: 2`, 3 lumps | Dedicated, worktree, three loadable lumps; spy deferred | Peak concurrent `runLumpFromLumpName` calls === 2; third starts after one resolves; tick/`waitForShutdownOverride` only after all three finished |
| G2 | Peak meta count | Same as G1 | While two in flight, `readDaemonMeta` → `inFlightLumpCount === 2`; after drain → `0`; raw meta has **no** `busy` key |
| G3 | Default sequential | Omit `maxParallelRun` (or `1`), worktree, 2 lumps | Peak concurrency === 1 (second starts only after first completes) |
| G4 | Checkout ignores parallelism | `workspaceStrategy: 'checkout'`, `maxParallelRun: 3`, 3 lumps | Peak concurrency === 1; optional: logger.info once that parallelism requires worktree |
| G5 | Multi-primary merged queue | `primaryBranches: ['main','ver']`, lumps on each branch forming ≥3 eligible names; worktree, `maxParallelRun: 2` | Single tick builds one combined list (no await-all-of-branch-before-next-branch pool); peak concurrency === 2 across lumps from different discovery branches |
| G6 | Failure isolation | Among 3 parallel-capable lumps, middle spy rejects/returns Failure | Other two still invoked; daemon start handler still `success: true` (tick continues); errors logged via existing error path |
| G7 | Shared mode pool | Shared + worktree + `maxParallelRun: 2` + ≥3 lumps | Same peak-2 behavior after `resolveTargetLumpNames` discovery |

**Where:** `packages/apps/cli/src/commands/start/testing/parallelGlobalDaemon.unit.test.ts` (`describe.skip` until implementation). Reuse multi-discovery fixtures from `multiDiscoveryBranches.unit.test.ts` for G5.

**Impl note:** Today dedicated tick `await`s inside the per-branch loop. G5 fails until discovery collects names first, then runs one pool.

### 5.4 Per-lump daemon ignores `maxParallelRun` (**S**)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| S1 | Scoped start | `--lumpName alpha`, worktree, `maxParallelRun: 3`, extra lumps present | Exactly one `runLumpFromLumpName('alpha')` per tick; other lumps never started |

**Where:** `packages/apps/cli/src/commands/start/testing/parallelGlobalDaemon.unit.test.ts` (`describe.skip`).

### 5.5 `ignoredByGlobalDaemon` (**I**)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| I1 | Global skips ignored | Lumps `alpha` (normal), `sideA` (`ignoredByGlobalDaemon: true`); global foreground | Spy called only for `alpha`; never for `sideA` |
| I2 | Startup log once | Two ignored lumps `sideA`, `sideB` | `logger.info` matches `/Global daemon ignoring lump\(s\):/` and lists both names; **not** re-logged on a second forced tick if test can fire two ticks (if only one tick in harness, assert call count === 1 for that message) |
| I3 | Per-lump daemon still runs ignored | `start --lumpName sideA` with ignored config | `runLumpFromLumpName('sideA')` invoked |
| I4 | Disabled still soft-skipped in phase 1 | Eligible non-ignored lump with `disabled: true` remains in discovery/queue path | Still reaches `runLumpFromLumpName` (or existing skip path); **not** filtered by ignored-flag logic — assert distinct from I1 (disabled lump may be “started” then skipped) |
| I5 | Manual run unaffected | Optional light case: call `run` handler / `runLumpFromLumpName` path for ignored lump | Invokes run (spy or success path); do **not** require full agent — prefer asserting start-scoped filter only + a unit that filtering helper is **not** used by `run` if such a helper is exported |

**Where:** I1–I4 in `start/testing/`; I5 only if cheap — otherwise covered by “filter lives only in global tick” code review + I3.

### 5.6 Meta `inFlightLumpCount` writers/readers (**M** — update busy hosts)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| M1 | Increment while in flight | Rewrite “sets busy: true while a lump run is in flight” | During deferred run, `inFlightLumpCount === 1`; no `busy: true` written |
| M2 | Clear after success | Rewrite “clears busy after a successful lump run” | After tick, `inFlightLumpCount === 0` (or omit/`0`); `busy` absent/not true |
| M3 | Clear after error / skipped | Rewrite error + skipped busy clears | Same as M2 |
| M4 | Allowed meta keys | Rewrite `assertMetaKeysAreAllowed` | Allowed includes `inFlightLumpCount`; **excludes** writing `busy`; still strips child-pid keys |
| M5 | Parallel ref-count | Two concurrent deferred runs | Peak `inFlightLumpCount === 2`; after both resolve → `0` (no stuck count / lost decrement) |
| M6 | `readDaemonMeta` parses count | File with `inFlightLumpCount: 2` | `data.inFlightLumpCount === 2` |
| M7 | Legacy `busy` still readable | File with `busy: true` only | `data.busy === true`; count may be undefined |
| M8 | Sequential windows (optional) | Replace “sets busy only during each sequential…” when `maxParallelRun: 1` | Snapshots show count `1` during each run window, `0` between if observable |

**Where:** M1–M5, M8 → `packages/apps/cli/src/commands/start/testing/daemonInFlightMeta.unit.test.ts`; M6–M7 → `packages/apps/cli/src/utils/readDaemonMeta/unit.test.ts`.

**`testImpl`:** Convert updated busy hosts to `it.skip` with new asserts already written.

### 5.7 Stop / restart mid-run (**K** — update stop/restart)

Requirements restore **refuse when mid-run** (distinct from the post–`kill-spawned-command-on-timeout-abort` cooperative busy SIGTERM). Rewrite conflicting ST* expectations.

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| K1 | Refuse when `inFlightLumpCount >= 1` | Alive daemon PID + meta `inFlightLumpCount: 2` | Default `stop` → `success: false`; messages mention mid-run / busy and `--force`; `--json` includes stable code `daemonBusy`; process still alive; artifacts kept |
| K2 | Legacy `busy: true` refuse | Meta `{ busy: true }` without count | Same refuse as K1 |
| K3 | Idle `inFlightLumpCount: 0` | Count `0` (or absent) + alive cooperative daemon | Default stop succeeds (SIGTERM + cleanup) within idle wait |
| K4 | `--force` while in flight | Count ≥ 1 | Force succeeds; kills tree; removes artifacts (keep existing force coverage, swap `busy` meta for `inFlightLumpCount`) |
| K5 | Restart while mid-run | Meta mid-run; `restart` without force | Fails via stop refuse (`daemonBusy`); does not leave a half-restarted daemon without clear failure |
| K6 | Both signals mid-run | Meta `{ busy: true, inFlightLumpCount: 0 }` | Still mid-run (legacy busy wins); refuse |
| K7 | Count wins when busy false | `{ busy: false, inFlightLumpCount: 1 }` | Refuse |

**Where:** `packages/apps/cli/src/commands/stop/unit.test.ts`, `packages/apps/cli/src/commands/restart/unit.test.ts`.

**Existing ST* mapping:** ST1/ST2/ST3/ST4/ST9 that assert cooperative success / “no daemonBusy” while busy must be **rewritten** to K1/K2 (refuse) or deleted. Keep ST5 (idle), ST6/ST7/ST10 (`--force`), ST8 (idle SIGTERM-ignore timeout) with meta using `inFlightLumpCount: 0`.

### 5.8 `daemon-status` (**D**)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| D1 | JSON/human includes count | Running daemon meta `inFlightLumpCount: 2` | Status `data.inFlightLumpCount === 2`; messages may mention in-flight; **do not** require emitting `busy` |
| D2 | Idle zero | `inFlightLumpCount: 0` | Surface `0` or omit consistently with writer contract (prefer always number `0` when running) |

**Where:** `packages/apps/cli/src/commands/daemon-status/unit.test.ts` (`it.skip`). Extend `StatusData` type in implementation.

### 5.9 `validateDaemonLaunch` still validates ignored lumps (**V**)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| V1 | Ignored but misconfigured | Lump with `ignoredByGlobalDaemon: true` and invalid config that already fails launch (e.g. discoveryBranch not allowlisted for explicit global discover path, or unloadable/invalid that validate treats as fail-fast for present configs) | Global `validateDaemonLaunch` / `start` still **fails** — ignored flag does **not** exclude from validation |
| V2 | Ignored valid still launches | Ignored + valid among other valid lumps | Launch succeeds; ignored only affect tick scheduling (covered by I1) |

**Where:** Prefer `packages/apps/cli/src/utils/validateDaemonLaunch/unit.test.ts` for V1 if an existing invalid-config failure shape is easy to reuse; otherwise `start/testing/` fail-before-tick. Use the same failure class already asserted for bad lumps (do not invent a new validation rule).

### 5.10 E2E harness (**E** — update only)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| E1 | `waitForDaemonIdle` | Meta transitions `inFlightLumpCount: 0 → ≥1 → 0` | Resolves after seeing mid-run then idle; also accepts legacy `busy: true` → cleared as mid-run→idle |

**Where:** `packages/apps/cli/src/e2e/harness/daemonHelpers.ts` + a **unit** assertion if the helper is not otherwise covered — optional thin test next to daemon helpers, or rely on existing `daemon-scenarios.test.ts` once unskipped implementation is green. Prefer updating the helper in `testImpl` behind the same skip discipline only if a focused unit exists; otherwise implement the helper change during **implementation** with checklist item (still required for AC).

---

## 6. Existing tests that must change

| Location | ID | Change |
| --- | --- | --- |
| `readLocalConfig/unit.test.ts` | L* | Add maxParallelRun cases; `it.skip` in `testImpl` |
| `readDaemonMeta/unit.test.ts` | M6–M7 | Keep legacy busy reads; add `inFlightLumpCount`; `it.skip` new/updated as needed |
| `start/testing/` — “daemon busy meta toggle” | M1–M5, M8 | Replace `busy` asserts with `inFlightLumpCount`; allowed keys; parallel peak; **`it.skip` in `testImpl`** |
| `start/testing/` — discovery order / multi-branch | G5 | Ensure merged-queue + pool; do not keep per-branch sequential awaits as the only path |
| `stop/unit.test.ts` — mid-run / ST1–ST4, ST9 | K* | Refuse + `daemonBusy` when mid-run; meta field migration |
| `restart/unit.test.ts` — busy cooperative restart | K5 | Expect refuse / `daemonBusy` when mid-run |
| `daemon-status/unit.test.ts` | D* | Expose count |
| `e2e/harness/daemonHelpers.ts` | E1 | Mid-run via count with `busy` fallback |

Leave collision tests (`assertDaemonStartAllowed` / worktree second per-lump) alone unless they break on meta shape.

---

## 7. Out of scope (explicit)

| Item | Why |
| --- | --- |
| New e2e with real agents proving wall-clock parallel speedup | Requirements: unit/integration without real agents |
| Parallelism under `checkout` | Non-goal (assert sequential only) |
| Parallel `start --lumpName` | Non-goal (S1) |
| Parallel contexts inside one lump | Core unchanged |
| Dynamic `ignoredByGlobalDaemon` | Non-goal |
| Hard cap on `maxParallelRun` | Non-goal |
| Changing `assertDaemonStartAllowed` collision rules | Out of scope for implementer |
| Filtering ignored lumps out of `validateDaemonLaunch` | Non-goal (opposite — V1) |
| Docs / schema text snapshots | Implementation checklist |
| `@lumpcode/core` | Unchanged |

---

## 8. Acceptance mapping

| Requirements acceptance | Covered by |
| --- | --- |
| `local.json` accepts `maxParallelRun`; invalid fails start; omit → 1 | L1–L6, G3 |
| Worktree global daemon runs up to N concurrently; queue drains | P1–P6, G1, G2, G7 |
| Checkout sequential regardless of `maxParallelRun` | G4 |
| Per-lump daemon ignores `maxParallelRun` | S1 |
| Dedicated multi-`primaryBranches` → one merged queue | G5 |
| `ignoredByGlobalDaemon` omitted from global; per-lump/manual still run | I1, I3 (, I5) |
| Startup logs ignored names once | I2 |
| `validateDaemonLaunch` still fails on misconfigured ignored lumps | V1 |
| Meta writes `inFlightLumpCount` only; 0 idle; parallel ref-count | M1–M5, G2 |
| `stop` refuses when count ≥ 1; legacy `busy: true` refuses | K1, K2, K6, K7 |
| One parallel failure does not block others | P4, G6 |
| Schema + CLI DOCS | §10 checklist |
| `daemon-status` / `waitForDaemonIdle` | D1–D2, E1 |

---

## 9. Commands to run

```bash
npm run test -w=@lumpcode/cli
```

Optional focus during red/green:

```bash
npm run test -w=@lumpcode/cli -- src/utils/runLumpQueueWithConcurrency/unit.test.ts
npm run test -w=@lumpcode/cli -- src/utils/readLocalConfig/unit.test.ts
npm run test -w=@lumpcode/cli -- src/utils/readDaemonMeta/unit.test.ts
npm run test -w=@lumpcode/cli -- src/commands/start/testing/
npm run test -w=@lumpcode/cli -- src/commands/stop/unit.test.ts
npm run test -w=@lumpcode/cli -- src/commands/restart/unit.test.ts
npm run test -w=@lumpcode/cli -- src/commands/daemon-status/unit.test.ts
npm run test -w=@lumpcode/cli -- src/utils/validateDaemonLaunch/unit.test.ts
```

---

## 10. Implementation-stage checklist (not automated here)

Confirm manually / by review when implementing:

- [ ] `LocalConfig.maxParallelRun?: number`; Zod/schema in `readLocalConfig` + `localConfig.schema.json`
- [ ] `LumpJsConfig.ignoredByGlobalDaemon?: boolean` + `lumpConfig.schema.json` description/example
- [ ] `updateDaemonMetaBusy` renamed/generalized; writers never set `busy`
- [ ] Meta updates under parallel ticks are atomic / serialized (no lost increments)
- [ ] Global tick: filter ignored → single work queue → `runLumpQueueWithConcurrency` when worktree; sequential otherwise
- [ ] Startup info log for ignored lumps (once)
- [ ] `stop` / `restart` mid-run predicate: `(inFlightLumpCount ?? 0) >= 1 || busy === true`
- [ ] `daemon-status` JSON/human includes `inFlightLumpCount`
- [ ] `waitForDaemonIdle` updated (E1)
- [ ] DOCS: `concepts.md`, `commands.md`, `lump-config.md`; optional README mention
- [ ] All `it.skip` / `describe.skip` for this item unskipped and green
