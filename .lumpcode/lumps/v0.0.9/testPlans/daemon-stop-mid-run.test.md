# Test plan: `stop --force` when daemon is mid-run

| Field | Value |
| --- | --- |
| **Backlog** | `daemon-stop-mid-run` · priority **2** · type **bugfix** |
| **PRD** | [daemon-stop-mid-run.prd.md](../prds/daemon-stop-mid-run.prd.md) |
| **Packages** | `packages/apps/cli` only |
| **Out of scope** | Subprocess pid collection in meta or core; cooperative abort (`AbortSignal`); automatic SIGKILL after default-stop timeout; `--force` on `restart`; busy detection from lock files or other heuristics; `daemon-status` surfacing `busy` (unless implementer adds it voluntarily); `packages/core` changes |

## Summary

Verify that the foreground daemon writes **`busy: true`** in meta JSON only while lump work inside a tick can block (`runLumpFromLumpName` through return), clears it when idle, and never records child pids. Verify **`lumpcode stop`** (default) refuses with an operator-facing info message when `meta.busy === true` (no signal, PID/meta left in place). Verify **`lumpcode stop --force`** skips the busy check, discovers the descendant process tree at stop time (no pre-collected pids), SIGKILLs deepest-first then the daemon, removes PID/meta on success, and kills a direct child spawned by the daemon in a Vitest fixture. Verify idle default stop remains SIGTERM-only within 5s.

**Scope:** ~25–35 `it()` blocks across one new util test file, extensions to `readDaemonMeta`, `stop`, and `start` unit tests, one optional E2E scenario, and a docs ship checklist.

### Layering

| Layer | Files | Responsibility |
| --- | --- | --- |
| Process tree | `utils/killProcessTree/unit.test.ts` | Unix descendant discovery + SIGKILL order; Windows `taskkill /T /F`; race-safe `ESRCH` |
| Meta schema | `utils/readDaemonMeta/unit.test.ts` | Optional `busy?: boolean`; no child-pid fields |
| Stop command | `commands/stop/unit.test.ts` | Busy refuse, `--force` tree kill, idle SIGTERM regression |
| Start command | `commands/start/unit.test.ts` | `busy` set/clear around tick lump work |
| E2E (optional) | `e2e/daemon-scenarios.test.ts` or new file | Slow mock agent + `--force` via binary subprocess |
| Docs | `DOCS/commands.md` | `--force`, busy message, best-effort detached-agent caveat |

## Test environment

- **Node:** 22+
- **Runner:** Vitest (`npm run test` in `packages/apps/cli`)
- **Conventions:** temp `projectRoot` / `globalConfigFolderPath`; local git `user.name` / `user.email` before commits; real `spawn` / `process.kill` for tree-kill tests (no mocking `ps` output); `cwd` with `execAsync` when shell is needed; teardown kills any leaked fixture pids in `afterEach`
- **Daemon tests:** `setDaemonTestGlobalConfigFolder`, `aliveDaemonSpawnFn`, `waitForDaemonPidFile`, `waitForDaemonMetaFile` from `testing/`
- **Platform:** Unix tree-kill tests run on `darwin` and `linux`; Windows `taskkill` test uses `it.skipIf(process.platform !== 'win32')` (mirror `e2e/run-scenarios.test.ts`)

### Commands

```bash
cd packages/apps/cli && npm run test
cd packages/apps/cli && npm run test -- src/utils/killProcessTree/unit.test.ts
cd packages/apps/cli && npm run test -- src/commands/stop/unit.test.ts
cd packages/apps/cli && npm run test:e2e   # optional scenario only
```

After CLI bundle changes touched by stop/start wiring:

```bash
cd packages/apps/cli && npm run build:bundle && npm run build:sea
```

---

## Test data

### Daemon meta fixtures

| ID | Meta JSON (written to `*.daemon.meta.json`) | `readDaemonMeta` result | Stop default behavior |
| --- | --- | --- | --- |
| `META-IDLE` | `{ "cronSetup": "*/5 * * * *", "workspaceStrategy": "checkout" }` | no `busy` field | SIGTERM path |
| `META-BUSY` | `{ "cronSetup": "*/5 * * * *", "workspaceStrategy": "checkout", "busy": true }` | `{ …, busy: true }` | refuse, no signal |
| `META-BUSY-LUMP` | `{ "cronSetup": "*/5 * * * *", "workspaceStrategy": "worktree", "lumpName": "alpha", "busy": true }` | per-lump scope | refuse with `--lumpName alpha` |
| `META-BUSY-FALSE` | `{ "cronSetup": "*/5 * * * *", "workspaceStrategy": "checkout", "busy": false }` | `busy` omitted or `false` | SIGTERM path (not busy) |

**Negative:** meta must never contain `activeChildPid`, `childPid`, or similar — assert keys after busy toggle tests.

### Expected operator messages

| Case | Substring(s) in failure `messages` (exact wording may vary slightly; must convey PRD intent) |
| --- | --- |
| Busy refuse | `running a lump`, `stop --force`, `subprocesses` (or equivalent PRD copy) |
| Force success | `force` or `forced`, daemon stopped, subprocesses targeted |
| Idle success (existing) | `Stopped Lumpcode daemon` |
| Idle timeout (existing, regression) | `did not exit within 5s` — only when daemon ignores SIGTERM and **not** busy |

### Process-tree fixture scripts

Add under `packages/apps/cli/src/testing/` (barrel-export helpers only; scripts stay co-located):

| Script | Behavior |
| --- | --- |
| `processTreeParent.cjs` | Writes `LUMPCODE_TREE_PARENT_PID=<pid>` to stdout; spawns `processTreeChild.cjs` (or `node -e` sleep); parent sleeps until killed |
| `processTreeChild.cjs` | Optional: spawns `processTreeGrandchild.cjs` for depth-2 test; otherwise `setInterval` sleep |
| `busyDaemonForegroundChild.cjs` (extend or fork `daemonForegroundChild.cjs`) | Writes PID/meta like today; sets `busy: true` in meta; spawns `processTreeChild.cjs`; stays alive until killed |

Env vars for tree fixtures: `LUMPCODE_TREE_CHILD_DEPTH` (`1` or `2`).

### Minimal lump project (reuse existing stop/start fixtures)

Same layout as `commands/stop/unit.test.ts`:

- `projectName`: `stop-mid-run-test-project` (or reuse `stop-test-project` in extended file)
- `local.json`: `{ "mode": "dedicated", "primaryBranch": "main" }`
- Lump `alpha` with minimal runnable `config.json` (`contextListJson` + `e2e-agent` or stub command for start busy tests)

### Spy / mock targets

| Target | Use |
| --- | --- |
| `runLumpFromLumpName` | Deferred resolve to observe `busy` while tick blocked |
| `process.kill` | Assert signal is `SIGTERM` on idle stop, never called on busy refuse |
| `killProcessTree` | Assert called only on `--force` path (optional injection on `stop` handler) |

---

## Automated tests

### 1. `readDaemonMeta` — `busy` field

**File:** `packages/apps/cli/src/utils/readDaemonMeta/unit.test.ts` (extend)

| `it()` | Input | Expectation |
| --- | --- | --- |
| Reads `busy: true` | `META-BUSY` | `result.data.busy === true` |
| Omits `busy` when absent | `META-IDLE` | `busy` undefined |
| Treats `busy: false` as not busy | `META-BUSY-FALSE` | `busy` false or omitted; stop treats as idle |
| Ignores unknown keys without failing | `{ …, activeChildPid: 123 }` | parse succeeds; `activeChildPid` not on `DaemonMeta` type |
| Preserves existing fields with `busy` | `META-BUSY-LUMP` | `cronSetup`, `workspaceStrategy`, `lumpName`, `busy` |

Update `DaemonMeta` / `daemonMetaSchema` / `DaemonMetaWrite` to include optional `busy?: boolean` only.

---

### 2. `killProcessTree` (new util)

**File:** `packages/apps/cli/src/utils/killProcessTree/unit.test.ts`

**Maps to:** PRD process-tree kill, acceptance #2

| `it()` | Fixture | Expectation |
| --- | --- | --- |
| Kills direct child on Unix | spawn `processTreeParent.cjs` (depth 1); read parent pid from stdout | `killProcessTree(parentPid)` → both parent and child `ESRCH` on `process.kill(pid, 0)` within 5s |
| Kills grandchild deepest-first on Unix | depth 2 fixture | parent, child, grandchild all dead; no orphan child |
| Does not kill unrelated sibling | spawn two independent sleep processes sharing no ancestry | only descendant closure of target pid affected |
| Ignores `ESRCH` races | kill tree twice or kill after natural exit | second call does not throw |
| Windows tree kill | `it.skipIf(process.platform !== 'win32')` spawn `cmd /c timeout /t 600` child | `taskkill /T /F` path leaves tree dead |

**Implementation notes:**

- Export `killProcessTree({ rootPid: number }): Promise<void>` (or `Success` / `Failure` if matching CLI util style).
- Unix: one `ps -ax -o pid=,ppid=` snapshot (or `pgrep -P` recursion) → build descendant set → sort deepest-first → `process.kill(pid, 'SIGKILL')`.
- `afterEach`: best-effort `killProcessTree` on fixture root if test failed mid-run.

---

### 3. `stop` command — busy refuse (default)

**File:** `packages/apps/cli/src/commands/stop/unit.test.ts` (extend)

**Maps to:** PRD acceptance #1

**Setup helper `seedBusyDaemon`:**

1. `runStart(aliveDaemonSpawnFn)` or spawn `busyDaemonForegroundChild.cjs` via custom `spawnFn`.
2. `waitForDaemonPidFile` + `waitForDaemonMetaFile`.
3. Overwrite meta with `META-BUSY` (or use child that writes `busy: true`).
4. Record `pid` from PID file.

| `it()` | Options | Expectation |
| --- | --- | --- |
| Refuses when `meta.busy === true` | `{}` | `success === false`; message matches busy refuse table; **no** timeout / SIGTERM wording |
| Leaves daemon alive | `{}` | `process.kill(pid, 0)` succeeds after stop |
| Leaves PID and meta files | `{}` | both paths still exist; meta still has `busy: true` |
| Busy refuse with `--json` | `{ json: true }` | failure envelope `messages` includes busy text (visible to operators using `--json`) |
| Scoped busy per-lump | `{ lumpName: 'alpha' }` + `META-BUSY-LUMP` paths | same refuse behavior for per-lump pid/meta filenames |
| Does not call `killProcessTree` | spy on util | zero calls without `--force` |
| SIGTERM not sent when busy | spy `process.kill` | no `SIGTERM` to daemon pid |

Add `--force` to `inputSchema` as optional boolean (Zod, same pattern as `start` `--foreground`).

---

### 4. `stop` command — `--force` tree kill

**File:** `packages/apps/cli/src/commands/stop/unit.test.ts` (extend)

**Maps to:** PRD acceptance #2, #3

**Setup helper `seedBusyDaemonWithChild`:**

- Spawn fixture where daemon pid is tree root and a **direct child** sleep process exists (via `busyDaemonForegroundChild.cjs` or `processTreeParent.cjs` registered as daemon pid file).
- Meta may have `busy: true` (force must still work).

| `it()` | Options | Expectation |
| --- | --- | --- |
| `--force` kills daemon and direct child | `{ force: true }` | daemon pid and child pid both `ESRCH`; no manual child pid in meta |
| `--force` removes PID and meta | `{ force: true }` | `ENOENT` on pid and meta paths |
| `--force` succeeds when busy | `{ force: true }` + `META-BUSY` | success; message notes forced stop / subprocesses |
| `--force` skips busy check | busy meta + force | success (contrast with default refuse case) |
| Idle daemon `--force` | `META-IDLE`, no child | still succeeds; pid/meta removed (regression for non-busy force) |
| Per-lump `--force` | `{ force: true, lumpName: 'alpha' }` | scoped pid/meta cleanup |

**Child pid discovery in test:** read child pid from fixture stdout (`LUMPCODE_TREE_CHILD_PID=`) or parse `ps` once before stop — test may discover child pid **only for assertions**, not passed into production code.

---

### 5. `stop` command — idle SIGTERM regression

**File:** `packages/apps/cli/src/commands/stop/unit.test.ts` (existing + extend)

**Maps to:** PRD acceptance #4

| `it()` | Expectation |
| --- | --- |
| `stops the daemon started by the start command…` (existing) | still passes unchanged |
| Idle stop uses SIGTERM not SIGKILL | spy: `process.kill(pid, 'SIGTERM')` called; no `SIGKILL` on daemon pid in default path |
| Idle stop does not call `killProcessTree` | spy zero calls |
| Completes within 5s | existing alive daemon exits promptly (no new timeout failure) |

**Regression fixture for old failure mode (optional):** spawn child that ignores SIGTERM (`processTreeParent.cjs` with `SIGTERM` handler) **without** `busy: true` — default stop should still hit 5s timeout message (proves busy path is distinct from slow exit).

---

### 6. `start` command — `busy` meta toggle

**File:** `packages/apps/cli/src/commands/start/unit.test.ts` (extend)

**Maps to:** PRD acceptance #5

Use foreground mode + `waitForShutdownOverride: () => new Promise(() => {})` so the handler stays alive while assertions run.

| `it()` | Mock / condition | Expectation |
| --- | --- | --- |
| Sets `busy: true` during `runLumpFromLumpName` | `vi.spyOn(runLumpFromLumpName)` awaits deferred promise | while deferred pending, meta JSON has `busy: true` |
| Clears `busy` after successful lump run | mock resolves success | meta has no `busy` or `busy: false` |
| Clears `busy` after failed lump run | mock resolves `failure` | not busy |
| Clears `busy` after skipped lump | mock resolves `{ skipped: true, reason: 'disabled' }` | not busy |
| Does not set `busy` when project disabled | `local.json` `{ disabled: true }` | meta never has `busy: true` during tick |
| Meta never gains child pid fields | any of above | `Object.keys(meta)` ⊆ `{ cronSetup, workspaceStrategy, lumpName, busy }` |
| Per-lump daemon scope | `--lumpName alpha` | busy toggle on per-lump meta filename |

**Polling helper `readMetaJson(metaFilePath)`:** parse file between microtasks; retry with short sleep (50ms) up to 2s.

**Boundary:** `busy` is set immediately before `runLumpFromLumpName` and cleared in `finally` around each lump invocation inside `runTick` (including dedicated multi-branch loop) — one lump failure must not leave `busy: true` for the next lump in the same tick.

---

### 7. `restart` — no `--force` passthrough (smoke)

**File:** `commands/restart/unit.test.ts` (optional single test or comment-only)

| `it()` | Expectation |
| --- | --- |
| Restart when daemon busy | still fails at stop step with busy message (non-force); documents non-goal until follow-up |

---

## E2E scenarios (optional)

| ID | Scenario | Steps | Expectation |
| --- | --- | --- | --- |
| `STOP-FORCE-E2E-S1` | Slow agent + force stop | Dedicated project; lump with `e2e-mock-agent` configured to sleep; `start --foreground` until meta `busy`; another CLI invocation `stop --force --json` | JSON failure/success per implementation; daemon and mock agent process gone; pid/meta removed |

Harness: extend `stopDaemonSafely` sibling `forceStopDaemon` with `--force`; rebuild SEA before running. Skip in CI if too flaky; unit tests are the acceptance gate per PRD.

---

## Test implementation details

### New modules

| Path | Export |
| --- | --- |
| `utils/killProcessTree/main.ts` | `killProcessTree` |
| `utils/killProcessTree/index.ts` | barrel |
| `testing/processTreeFixtures.ts` | `spawnProcessTreeFixture`, `assertPidDead`, `readMetaJson` |
| `testing/processTreeParent.cjs` | fixture script |
| `testing/processTreeChild.cjs` | fixture script |

Barrel-export `killProcessTree` from `utils/index.ts`. Stub throws `not implemented` until implementation (red-first acceptable).

### Files to update

| File | Action |
| --- | --- |
| `utils/readDaemonMeta/main.ts` | `busy?: boolean` on schema and types |
| `commands/stop/main.ts` | `--force`; read meta; busy gate; call `killProcessTree` on force |
| `commands/start/main.ts` | `updateDaemonMetaBusy(metaFilePath, busy)` at lump run boundaries inside `runTick` |
| `commands/stop/unit.test.ts` | sections 3–5 |
| `commands/start/unit.test.ts` | section 6 |
| `DOCS/commands.md` | `--force`, busy info, best-effort detached agents |

### Suggested `updateDaemonMetaBusy` behavior

Read current meta (or start from in-memory `metaPayload`), merge `busy: true | false` (omit key when false), rewrite file. Called only from foreground daemon process (same writer as initial `writeDaemonArtifacts`).

### Assertion snippets

Busy refuse:

```ts
const result = await makeStopHandler()({ options: {}, arguments: {} });
expect(result.success).toBe(false);
expect(result.data.messages.join(' ')).toMatch(/stop --force/i);
expect(() => process.kill(daemonPid, 0)).not.toThrow();
await expect(fs.access(pidPath())).resolves.toBeUndefined();
```

Force kills child without meta pid:

```ts
const meta = JSON.parse(await fs.readFile(metaPath(), 'utf8'));
expect(meta.activeChildPid).toBeUndefined();
const result = await makeStopHandler()({ options: { force: true }, arguments: {} });
expect(result.success).toBe(true);
await assertPidDead(daemonPid);
await assertPidDead(childPid); // from fixture stdout only
```

Busy during tick:

```ts
const metaWhileBusy = await pollUntil(
  () => readMetaJson(metaPath()),
  (m) => m.busy === true,
);
expect(metaWhileBusy.busy).toBe(true);
releaseRun();
await pollUntil(() => readMetaJson(metaPath()), (m) => m.busy !== true);
```

SIGTERM-only idle stop:

```ts
const killSpy = vi.spyOn(process, 'kill');
await makeStopHandler()({ options: {}, arguments: {} });
expect(killSpy.mock.calls.some((c) => c[1] === 'SIGTERM')).toBe(true);
expect(killSpy.mock.calls.some((c) => c[1] === 'SIGKILL')).toBe(false);
killSpy.mockRestore();
```

### Teardown safety

```ts
afterEach(async () => {
  for (const pid of fixturePids) {
    try { process.kill(pid, 'SIGKILL'); } catch { /* ESRCH */ }
  }
});
```

---

## Ship checklist

| File | Check |
| --- | --- |
| `DOCS/commands.md` | `stop` options table includes `--force`; busy info message documented; tree kill + best-effort detached-agent caveat |
| `AGENTS.md` | Daemon stop / `meta.busy` / `--force` workspace facts (if behavior lands) |

---

## PRD traceability

| PRD acceptance | Covered by |
| --- | --- |
| `stop` with `busy: true` prints info and does not kill daemon | §3 |
| `stop --force` kills busy daemon + direct child in fixture (no meta pid tracking) | §2, §4 |
| `stop --force` removes PID/meta after tree kill | §4 |
| `stop` when not busy uses SIGTERM only within 5s | §5 |
| Daemon sets/clears `busy` around lump runs; no child pid fields | §6 |
| `DOCS/commands.md` updated | Ship checklist |

## Pass criteria

- All new and updated Vitest tests in `packages/apps/cli` pass on macOS and Linux CI.
- Windows job runs `killProcessTree` Windows `it()` when platform is `win32`.
- No `packages/core` changes required.
- Optional E2E passes after `build:bundle` + `build:sea` when enabled.
- Default `stop` on busy daemon never produces the old `did not exit within 5s` timeout string.
