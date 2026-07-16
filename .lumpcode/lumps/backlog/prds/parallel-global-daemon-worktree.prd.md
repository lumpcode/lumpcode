# PRD: Parallel global daemon (worktree) and `ignoredByGlobalDaemon`

| Field | Value |
| --- | --- |
| **Backlog** | TBD — add to `BACKLOG.yml` when scheduled |
| **Type** | feature |
| **Packages** | `packages/apps/cli` only; `packages/core` unchanged |

## Problem statement and motivation

Today the **global daemon** (`lumpcode start` with no `--lumpName`) runs lumps **one at a time** within each cron tick, even when `workspaceStrategy` is **`worktree`**. Each lump already gets an isolated branch workspace under `.lumpcode/worktrees/<branch-as-nested-dirs>/`, and workspace path locks allow different paths to be held concurrently across processes. The global daemon does not take advantage of that isolation: it `await`s each `runLumpFromLumpName` before starting the next lump.

Operators with many lumps and sufficient machine resources (CPU, memory, agent rate limits) cannot speed up a tick without running multiple **per-lump daemons** manually. That increases operational overhead (one PID/log/meta per lump) and duplicates scheduler configuration.

Separately, some lumps are intentionally driven **outside** the global rotation (dedicated per-lump daemon, manual `lumpcode run`, or an external workflow). Per-lump **`disabled: true`** removes a lump from **all** invocations, including manual `run`. There is no way to say “global daemon, skip this lump; I will run it myself” without disabling it entirely or removing it from the lumps directory.

## Goals

1. **Parallel global daemon ticks when worktrees isolate lumps** — allow up to **`maxParallelRun`** concurrent lump runs in a single global-daemon tick when `workspaceStrategy === 'worktree'`.
2. **Configurable cap in `local.json`** — machine-local parallelism limit, default **`1`** (preserve today’s sequential behavior).
3. **Per-lump opt-out from global rotation** — **`ignoredByGlobalDaemon`** boolean on lump config; lump remains runnable via per-lump daemon and manual `run`.
4. **Observable in-flight state** — replace daemon meta **`busy`** with **`inFlightLumpCount`** (integer, **`0` when idle**); graceful `stop` treats **`inFlightLumpCount >= 1`** (with legacy read fallback for `busy: true`) as “daemon mid-run”.
5. **Safe scheduling** — work-queue pool drains the tick’s lump list without fail-fast on individual lump errors; existing workspace path locks and daemon `lockMode: 'wait'` remain the cross-process safety layer.
6. **Docs and schema alignment** — document new fields in CLI DOCS, `local.json` descriptions, and `lumpConfig.schema.json`.

## Non-goals

- Parallel runs in **`checkout`** workspace strategy (all lumps share one execution/branch workspace path; stays sequential).
- Parallel **`maxParallelRun`** for **per-lump daemons** (`lumpcode start --lumpName <name>`) — always one lump per tick.
- Parallel **context** execution within a single lump (existing sequential `executeStepsForContextList` unchanged).
- Dynamic **`ignoredByGlobalDaemon`** (function or FilePath) — boolean only in v1.
- Core API changes (`runLump`, `executeStepsForContextList`, workspace fns in `@lumpcode/core`).
- New CLI flags on `start` / `run` for parallelism (configuration is `local.json` + lump config only).
- Distributed coordination across machines (locks remain per host under `globalConfigFolderPath`).
- Hard upper cap on `maxParallelRun` in code (document resource guidance instead).

## User stories / use cases

1. **Operator (worktree, many lumps)** — I run a global daemon on a machine with headroom for three agents. I set `"workspaceStrategy": "worktree"` and `"maxParallelRun": 3` in `local.json`. Each cron tick keeps up to three lumps in flight; when one finishes, the next queued lump starts automatically.
2. **Operator (side-managed lump)** — Lump `manualReview` needs a dedicated per-lump daemon with a custom cron. I set `"ignoredByGlobalDaemon": true` on that lump. The global daemon logs it once at startup and never schedules it; `lumpcode start --lumpName manualReview` and `lumpcode run manualReview` still work.
3. **Operator (graceful stop)** — While two lumps are in flight, `lumpcode stop` refuses (non-zero, suggest `--force`) because `inFlightLumpCount === 2`. After both complete, stop succeeds as today.
4. **Operator (checkout mode)** — I leave `maxParallelRun` at `3` but use `checkout`. The global daemon stays sequential; optionally log once that parallelism requires worktree.
5. **Maintainer** — Unit/integration tests cover pool scheduling, meta ref-count, ignored-lump filtering, and legacy `busy` read fallback without real agents.

## Proposed behavior and UX

### `maxParallelRun` (`.lumpcode/local.json`)

New optional field on **`LocalConfig`**:

| Field | Type | Default | Applies when |
| --- | --- | --- | --- |
| `maxParallelRun` | positive integer | `1` | Unscoped global daemon (`lumpcode start`) and `workspaceStrategy === 'worktree'` |

**Validation at `lumpcode start`:**

- Must be a positive integer (`>= 1`). Reject `0`, negatives, floats, and non-numbers with a clear error; do not start the daemon.
- Omit → treat as **`1`**.

**When ignored:**

- `workspaceStrategy !== 'worktree'` — sequential lump runs (same as today); optionally log once if `maxParallelRun > 1`.
- Per-lump scoped daemon (`lumpcode start --lumpName <name>`) — field has no effect.

Example `local.json` fragment:

```json
{
  "mode": "dedicated",
  "primaryBranch": "dev",
  "workspaceStrategy": "worktree",
  "maxParallelRun": 3
}
```

### Global daemon tick scheduling

Syntax unchanged:

```bash
lumpcode start [--foreground] [--cronSetup '<cron>'] [--json]
```

**Eligible lumps per tick:**

1. Discover lumps using existing paths:
   - **Dedicated:** `discoverDedicatedLumpsForScanBranch` for each entry in `effectivePrimaryBranches`; merge into one list (dedupe by lump name per today’s rules).
   - **Shared:** `resolveTargetLumpNames` (all loadable lumps).
2. **Filter out** lumps with **`ignoredByGlobalDaemon: true`** (read boolean from loaded lump config).
3. **Do not filter** lumps with `disabled: true` at discovery time — existing phase-1 soft skip in `runLumpFromLumpName` still applies per lump.

**Execution:**

- Build a **single tick-wide work queue** from the eligible lump name list (preserve discovery iteration order unless a stable sort is already implied elsewhere).
- Run with a concurrency pool capped at **`min(maxParallelRun, eligibleCount)`**:
  - Start up to N lumps concurrently.
  - When one finishes (success, failure, or skipped), start the next lump from the queue if any remain.
  - **`await` until the entire queue is drained** before the tick returns (Croner `{ protect: true }` unchanged).
- **Failure isolation:** one lump’s failure does not cancel in-flight siblings or prevent starting subsequent queued lumps. Log per-lump errors as today.

**Logging at global daemon startup (once):**

- If any lumps have `ignoredByGlobalDaemon: true`, emit one info line, e.g.  
  `Global daemon ignoring lump(s): sideA, sideB`

Do not log ignored lumps on every cron tick.

### `ignoredByGlobalDaemon` (lump config)

New optional field on **`LumpJsConfig`** / `lumpConfig.schema.json`:

| Field | Type | Default |
| --- | --- | --- |
| `ignoredByGlobalDaemon` | `boolean` | `false` (omit) |

**Scope — who respects the flag:**

| Invocation | Respects `ignoredByGlobalDaemon`? |
| --- | --- |
| Global daemon tick (`lumpcode start`) | **Yes** — omit from queue |
| Per-lump daemon (`lumpcode start --lumpName <name>`) | **No** |
| Manual `lumpcode run <name>` | **No** (unless `disabled`) |
| `lump-status`, `lump-plan` | **No** — still listed |
| `validateDaemonLaunch` at global `start` | **No** — still validate all loadable lumps (including ignored); bad config fails `start` |

Example lump config fragment:

```json
{
  "command": "cursor",
  "ignoredByGlobalDaemon": true,
  "steps": ["..."]
}
```

### Daemon meta: `inFlightLumpCount` replaces `busy`

**Writers** (global and per-lump daemons during lump runs):

- Stop writing **`busy`**.
- Maintain **`inFlightLumpCount`**: increment before each `runLumpFromLumpName`, decrement in `finally`.
- When idle between ticks / before first run: **`inFlightLumpCount: 0`**.

**Readers** (`stop`, `restart`, `waitForDaemonIdle`, `daemon-status`):

- Treat daemon as **mid-run** when **`(inFlightLumpCount ?? 0) >= 1`** **or** legacy **`busy === true`** (upgrade safety for a daemon started on an older CLI).
- **`stop`** (default): refuse when mid-run; message mentions `--force`; `--json` stable code (today: `daemonBusy`) unchanged in meaning.
- **`daemon-status` / `--json`:** surface `inFlightLumpCount`; do not emit `busy` on new writes.

Example meta during a parallel tick:

```json
{
  "cronSetup": "*/15 * * * *",
  "workspaceStrategy": "worktree",
  "inFlightLumpCount": 2
}
```

### Interaction with existing limits

| Mechanism | Relationship |
| --- | --- |
| **`maximumNumberOfConcurrentBranches`** | Unchanged — per-lump remote branch cap evaluated inside each `runLumpFromJsConfig`; parallel runs may each skip independently when at limit. |
| **Workspace path locks** | Unchanged — different worktree paths run concurrently; same path still serializes (`lockMode: 'wait'` for daemon, `fail` for manual `run`). |
| **Dedicated execution-workspace lock (worktree phase 1)** | Unchanged — brief execution-path hold during discovery/setup; released after worktree setup per existing `withWorkspaceLockHooks`. |

## Docs updates

| Surface | Change |
| --- | --- |
| **`DOCS/concepts.md`** | Global daemon parallel ticks (worktree + `maxParallelRun`); cross-link workspace strategy section. |
| **`DOCS/commands.md`** | `start` — parallelism, `inFlightLumpCount`, graceful `stop` semantics; note per-lump daemon ignores `maxParallelRun`. |
| **`DOCS/lump-config.md`** | Document `ignoredByGlobalDaemon`. |
| **`local.json` schema / `project-setup` help text** | Document `maxParallelRun` (if a schema or setup doc exists for local config). |
| **`lumpConfig.schema.json`** | Add `ignoredByGlobalDaemon` with description and example. |
| **`packages/apps/cli/README.md`** | Brief mention of parallel global daemon when using worktree (optional, if README already discusses daemon caps). |

## Technical approach

### Affected areas (`packages/apps/cli`)

| Area | Change |
| --- | --- |
| **`types/LocalConfig.ts`** | Add `maxParallelRun?: number`. |
| **`types/LumpJsConfig.ts`** | Add `ignoredByGlobalDaemon?: boolean`. |
| **`utils/readLocalConfig/`** | Parse and validate `maxParallelRun` (positive integer). |
| **`commands/start/main.ts`** | Filter ignored lumps; replace sequential `for` + `await runOneLump` with work-queue pool when worktree + global daemon; ref-count `inFlightLumpCount`; startup log for ignored lumps. |
| **`utils/readDaemonMeta/`**, **`updateDaemonMetaBusy`** (rename or generalize) | Schema: `inFlightLumpCount`; remove `busy` from writers. |
| **`commands/stop/main.ts`**, **`commands/restart/`** | Mid-run check via `inFlightLumpCount >= 1 \|\| busy === true`. |
| **`commands/daemon-status/`** | Expose `inFlightLumpCount` in human and JSON output. |
| **`e2e/harness/daemonHelpers.ts`** | `waitForDaemonIdle` uses new field with legacy fallback. |
| **New util (recommended)** | e.g. `utils/runLumpQueueWithConcurrency/` — reusable pool given `lumpNames[]`, concurrency, and `runOneLump` callback; keeps `start/main.ts` readable. |
| **Helper to list ignored lumps** | e.g. filter after `discoverLoadableLumps` by loading each config’s boolean (or extend discovery to return the flag). |

### Sequencing / dependency

- Can build on existing workspace path locks and `await runTick()` (post workspace-lock PRD).
- **`inFlightLumpCount`** supersedes **`busy`** for new daemons; keep read fallback until no supported release writes `busy`.

### Out of scope for implementer

- Changing `assertDaemonStartAllowed` collision rules (worktree already allows multiple per-lump daemons).
- Filtering ignored lumps out of `validateDaemonLaunch`.

## Acceptance criteria

- [ ] `local.json` accepts `maxParallelRun`; invalid values fail `lumpcode start` with a clear message; omit defaults to `1`.
- [ ] Global daemon with `workspaceStrategy: 'worktree'` and `maxParallelRun: N` runs up to N lumps concurrently within a tick; queue drains fully before tick completes.
- [ ] Global daemon with `checkout` strategy runs lumps sequentially regardless of `maxParallelRun`.
- [ ] Per-lump daemon (`start --lumpName`) ignores `maxParallelRun`; one lump per tick unchanged.
- [ ] Dedicated multi-`primaryBranches` tick uses one merged queue (not per-branch sequential pools).
- [ ] Lump with `ignoredByGlobalDaemon: true` is never scheduled by global daemon; per-lump daemon and manual `run` still execute it.
- [ ] Global daemon logs ignored lump names once at startup.
- [ ] `validateDaemonLaunch` still fails on misconfigured ignored lumps.
- [ ] Daemon meta writes `inFlightLumpCount` only; `0` when idle; increments/decrements correctly under parallel runs.
- [ ] `stop` refuses when `inFlightLumpCount >= 1`; legacy meta with `busy: true` still refuses.
- [ ] One parallel lump failure does not prevent other in-flight or queued lumps from running.
- [ ] `lumpConfig.schema.json` and CLI DOCS updated for both new fields.

## Open questions and risks

| Item | Notes |
| --- | --- |
| **Resource exhaustion** | No hard cap on `maxParallelRun`; operators can oversubscribe CPU/memory/agent quotas. Mitigation: docs + default `1`. |
| **Discovery order fairness** | Queue order follows discovery iteration; a perpetually busy head lump does not block slots in a pool (unlike batch mode), but order may starve tail lumps if the queue is always refilled each tick with the same order. Accept for v1; revisit fair scheduling if needed. |
| **Meta write contention** | Parallel runs increment/decrement `inFlightLumpCount` concurrently; implementer must use atomic read-modify-write or serialize meta updates to avoid lost updates. |
| **Upgrade mid-run** | Daemon started on old CLI may write `busy` only; new CLI `stop` must honor legacy field until old daemons are gone. |
| **`maximumNumberOfConcurrentBranches` vs parallelism** | Parallel global runs may all skip quickly if branch cap is reached; expected, not a bug. |
| **Shared mode** | Same pool logic as dedicated after shared discovery; confirm worktree paths on project copy remain distinct per lump branch (existing behavior). |
