# Test plan: Daemon stop mid-run (`stop --force`, `meta.busy`)

| Field | Value |
| --- | --- |
| **Backlog** | `daemon-stop-mid-run` · priority **2** · type **bugfix** |
| **PRD** | [daemon-stop-mid-run.prd.md](../prds/daemon-stop-mid-run.prd.md) |
| **Packages** | `packages/apps/cli` only |
| **Out of scope** | Child-pid fields in meta; cooperative `AbortSignal` abort; auto-SIGKILL after default stop timeout; `--force` on `restart`; inferring busy from workspace lock files; E2E subprocess scenarios; `packages/core` changes |

## Summary

Verify the foreground daemon toggles **`busy`** in daemon meta around each `runLumpFromLumpName` call; default **`lumpcode stop`** refuses (non-zero, informative message, optional JSON `code: "daemonBusy"`) when `meta.busy === true` without signaling the process; **`lumpcode stop --force`** tree-kills the daemon PID and all descendants at stop time (no pid collection during runs), then removes PID/meta; idle stop remains SIGTERM-only within 5s; `readDaemonMeta` accepts optional `busy`; `DOCS/commands.md` documents `--force`, busy refusal, and best-effort tree-kill caveat.

**Scope:** ~18–24 `it()` blocks across one new util test file, updates to `stop` / `start` / `readDaemonMeta` unit tests, one small testing fixture script, and a docs ship checklist. **No E2E** (per PRD).

### Layering

| Layer | Files | Responsibility |
| --- | --- | --- |
| Meta schema | `utils/readDaemonMeta/unit.test.ts` | Parse `busy?: boolean`; no child-pid fields |
| Tree kill | `utils/killProcessTree/unit.test.ts` (new) | Platform tree-kill of parent + descendants |
| Stop command | `commands/stop/unit.test.ts` | Busy refusal, idle SIGTERM, `--force` integration |
| Start command | `commands/start/unit.test.ts` | Toggle `busy` around lump runs |
| Docs | `DOCS/commands.md` | `--force`, busy behavior, best-effort caveat |

## Test environment

- **Node:** 22+
- **Runner:** Vitest (`npm run test` in `packages/apps/cli`)
- **Conventions:** temp `projectRoot` / `globalConfigFolderPath`; real `spawn` for process-tree fixtures; `setDaemonTestGlobalConfigFolder` for daemon artifact paths; `cwd` with `execAsync`/`execSync` — no `cd … &&` in command strings
- **Platform:** Tree-kill util tests run real OS behavior; gate Unix-only vs Windows-only cases with `process.platform` (CI matrix covers ubuntu, macOS, windows)

### Commands

```bash
cd packages/apps/cli && npm run test
cd packages/apps/cli && npm run test -- src/utils/killProcessTree/unit.test.ts
cd packages/apps/cli && npm run test -- src/commands/stop/unit.test.ts
cd packages/apps/cli && npm run test -- src/commands/start/unit.test.ts
cd packages/apps/cli && npm run test -- src/utils/readDaemonMeta/unit.test.ts
```

---

## Test data

### Daemon meta fixtures

Written under `{globalConfigFolderPath}/daemons/{projectName}[.{lumpName}].daemon.meta.json` (paired with `.daemon.pid`).

| ID | JSON body (minimal fields + `busy`) | Used for |
| --- | --- | --- |
| `META-IDLE` | `{ "cronSetup": "*/5 * * * *", "workspaceStrategy": "checkout" }` | Default stop succeeds (no `busy` key) |
| `META-IDLE-FALSE` | `{ "cronSetup": "*/5 * * * *", "workspaceStrategy": "checkout", "busy": false }` | Default stop succeeds |
| `META-BUSY` | `{ "cronSetup": "*/5 * * * *", "workspaceStrategy": "checkout", "busy": true }` | Default stop refuses |
| `META-BUSY-LUMP` | `{ "cronSetup": "*/5 * * * *", "workspaceStrategy": "checkout", "lumpName": "alpha", "busy": true }` | Per-lump scoped busy refusal |
| `META-STALE-BUSY` | Same as `META-BUSY` after simulated crash | Documents trusted stale `busy` (same assertions as `META-BUSY`) |

Meta must **never** contain child-pid fields (`childPid`, `childPids`, `agentPid`, etc.) — assert negatively in start busy-toggle tests.

### Project fixtures (reuse `stop` / `start` unit harness)

| Field | Value |
| --- | --- |
| `projectName` | `stop-mid-run-test-project` (global); `stop-mid-run-lump-project` (per-lump) |
| `local.json` | `{ "mode": "dedicated", "primaryBranch": "main" }` |
| Lump `alpha` | Minimal runnable `config.json` (same as existing `stop`/`start` tests: `contextListJson` + `prompt` with `"command": "claude"`) |
| Git | Temp repo with `user.name` / `user.email` and empty initial commit |

### Process-tree fixtures (new testing script)

**File:** `packages/apps/cli/src/testing/processTreeChild.cjs`

Spawned by tests via `node processTreeChild.cjs` with env:

| Env var | Purpose |
| --- | --- |
| `LUMPCODE_TREE_CHILD_DEPTH` | `0` = leaf (`setInterval` only); `1+` = spawn child at depth−1 before blocking |
| `LUMPCODE_TREE_READY_FILE` | Optional path; parent writes own PID when tree is built (for race-free assertions) |

**Fixture trees:**

| ID | Structure | Purpose |
| --- | --- | --- |
| `TREE-SINGLE` | One process | Baseline force-stop |
| `TREE-PARENT-CHILD` | Parent → one child | PRD acceptance: daemon + child killed |
| `TREE-DEEP` | Parent → child → grandchild | Descendant closure (Unix deepest-first ordering) |

**SIGTERM-resistant variant:** `packages/apps/cli/src/testing/sigtermIgnorantTreeChild.cjs` — installs `SIGTERM` handler (no exit), spawns a sleeping child. Default `stop` times out or fails within 5s; `stop --force` still succeeds. Reuse for “blocked mid-run” simulation without meta (optional negative control; not required if `META-BUSY` covers default path).

### Stop handler inputs

| ID | `options` | Notes |
| --- | --- | --- |
| `STOP-DEFAULT` | `{}` | Busy check + SIGTERM path |
| `STOP-FORCE` | `{ force: true }` | Skip busy; tree-kill |
| `STOP-JSON` | `{ json: true }` | Failure envelope includes `data.code` |
| `STOP-LUMP` | `{ lumpName: 'alpha' }` | Per-lump PID/meta paths |

---

## Automated tests

### 1. `readDaemonMeta` (extend existing)

**File:** `packages/apps/cli/src/utils/readDaemonMeta/unit.test.ts`

| `it()` | Input | Expectation |
| --- | --- | --- |
| Reads `busy: true` | `META-BUSY` on disk | `result.success`; `result.data.busy === true`; other fields preserved |
| Reads `busy: false` | `META-IDLE-FALSE` | `result.data.busy === false` |
| Omits `busy` when absent | `META-IDLE` | `result.data.busy === undefined` (not coerced to `false` in parsed type) |
| Ignores unknown child-pid keys | JSON with `agentPid: 12345` plus valid fields | Either strip via schema (preferred) or ignore — meta returned without `agentPid`; test locks schema to known keys only |

**Implementation note:** Extend `daemonMetaSchema` and exported `DaemonMeta` / `DaemonMetaWrite` types with optional `busy?: boolean`. `DaemonMetaWrite` stays without `busy` at initial detach; daemon rewrites meta at run boundaries.

---

### 2. `killProcessTree` (new util)

**File:** `packages/apps/cli/src/utils/killProcessTree/main.ts` + `index.ts` (barrel from `utils/index.ts`)

**File:** `packages/apps/cli/src/utils/killProcessTree/unit.test.ts`

| `it()` | Fixture | Expectation |
| --- | --- | --- |
| Kills single process | `TREE-SINGLE` | After `killProcessTree(pid)`, `process.kill(pid, 0)` throws `ESRCH` within poll window |
| Kills parent and child | `TREE-PARENT-CHILD` | Both root PID and recorded child PID unreachable (`ESRCH`) |
| Kills deep tree | `TREE-DEEP` | All PIDs in tree unreachable |
| Idempotent on dead pid | Already exited PID | No throw; returns success (or structured failure only if platform command fails — document chosen contract) |

**Platform expectations:**

| OS | Mechanism under test |
| --- | --- |
| Unix (`darwin`, `linux`, …) | Descendant discovery via process listing (`ps` / `pgrep` — match implementation); **SIGKILL deepest-first** |
| Windows (`win32`) | `taskkill /PID <pid> /T /F` (mock `execFile` **or** run guarded live test on CI windows job) |

**Test implementation details:**

- Spawn with `spawn(process.execPath, [scriptPath], { detached: true, stdio: 'ignore' })`; unref parent as needed.
- Wait for `LUMPCODE_TREE_READY_FILE` before calling `killProcessTree`.
- Poll every 50ms up to 5s for `ESRCH` on each expected PID.
- Register `afterEach` guard that force-kills fixture PIDs if test fails (avoid orphaned CI processes).
- Prefer testing the public `killProcessTree({ pid })` API; keep `execFile` mock only for Windows unit if live `taskkill` is flaky locally.

---

### 3. `stop` command (extend existing)

**File:** `packages/apps/cli/src/commands/stop/unit.test.ts`

Keep existing cases (`no PID file`, stale PID cleanup, idle SIGTERM stop). Add:

| `it()` | Setup | Handler | Expectation |
| --- | --- | --- | --- |
| Refuses when `meta.busy === true` | `aliveDaemonSpawnFn` start + overwrite meta with `META-BUSY` (keep live PID) | `STOP-DEFAULT` | `success: false`; message matches `/busy/i` and `/--force/`; **no** `ESRCH` on daemon PID (still alive); PID + meta files still exist |
| JSON code `daemonBusy` | Same as above | `STOP-JSON` | `result.data.code === 'daemonBusy'` (and `messages` non-empty) |
| Does not SIGTERM when busy | Same; install spy `vi.spyOn(process, 'kill')` | `STOP-DEFAULT` | `process.kill` not called with `SIGTERM` for daemon pid (allow spy restore in `finally`) |
| `--force` skips busy check | Busy meta + live daemon | `STOP-FORCE` | `success: true`; PID + meta removed; daemon PID `ESRCH` |
| `--force` kills child subprocess | `sigtermIgnorantTreeChild.cjs` or `TREE-PARENT-CHILD` registered as daemon PID (write pid/meta manually) | `STOP-FORCE` | Root and child PIDs gone; artifacts removed |
| Per-lump busy refusal | Per-lump daemon paths (`projectName.alpha.daemon.*`), `META-BUSY-LUMP` | `STOP-LUMP` + `STOP-JSON` | Same refusal semantics; global daemon untouched |
| Idle stop unchanged | `aliveDaemonSpawnFn` without `busy` | `STOP-DEFAULT` | Existing success path: SIGTERM, cleanup within 5s |
| Force when not busy | `aliveDaemonSpawnFn` idle | `STOP-FORCE` | Still succeeds; artifacts removed (force is superset) |

**Implementation details:**

- Extend `inputSchema` with `force: z.boolean().optional()` (Commander boolean flag `--force`).
- Handler flow: `readDaemonPidIfAlive` → `readDaemonMeta` → if `!force && meta.busy === true` return `failure({ messages: [...], data: { code: 'daemonBusy' } })` → else existing SIGTERM path or `killProcessTree` when `force`.
- Inject `killProcessTree` optional dep only if needed for unit isolation; otherwise call util directly (prefer direct call + separate util tests per repo conventions).
- Use `waitForDaemonPidFile` before mutating meta in busy tests.

**Negative control (optional):**

| `it()` | Expectation |
| --- | --- |
| Default stop still times out against SIGTERM-ignoring process when `busy` absent | `success: false`; message matches `/did not exit within/`; PID file remains — documents unchanged non-busy failure mode |

---

### 4. `start` command — `busy` meta toggle (extend existing)

**File:** `packages/apps/cli/src/commands/start/unit.test.ts`

Use **foreground** mode (`options: { foreground: true, cronSetup: '*/5 * * * *' }`) so PID/meta are written in-process. Spy `runLumpFromLumpName` to control timing.

| `it()` | Mock behavior | Expectation |
| --- | --- | --- |
| Sets `busy: true` during lump run | `runLumpFromLumpName` returns promise held until test reads meta | While promise pending, `readDaemonMeta(metaPath)` → `busy === true` |
| Clears `busy` after lump success | Mock resolves `success({ skipped: false, result: { … } })` | After tick completes, meta has `busy` absent or `false` |
| Clears `busy` after lump error | Mock resolves `failure(…)` | `busy` cleared in `finally` |
| Clears `busy` after skipped lump | Mock resolves `success({ skipped: true, reason: 'disabled', … })` | `busy` cleared |
| No child pid fields in meta | Any of above | `JSON.parse(meta)` keys ⊆ `{ cronSetup, workspaceStrategy, lumpName?, busy? }` |
| Sequential lumps (global tick) | Two lumps; mock sequential delayed resolves | `busy` true only during each lump’s in-flight window (dedicated multi-lump tick or two-name shared tick) |

**Implementation details:**

- Add `updateDaemonMetaBusy(metaFilePath, busy: boolean)` helper in `start/main.ts` (private or `utils/`) that read-merge-writes meta JSON atomically (write temp + rename optional; at minimum rewrite full object).
- Wrap body of `runOneLump`: `await setBusy(true)` → `try { await runLumpFromLumpName(…) } finally { await setBusy(false) }`.
- Tests read meta via `readDaemonMeta` or raw `fs.readFile` for timing-sensitive assertions.
- Reuse `waitForShutdownOverride` to release blocked mock after meta assertion.

---

### 5. `restart` command (regression only)

**File:** `packages/apps/cli/src/commands/restart/unit.test.ts`

| `it()` | Setup | Expectation |
| --- | --- | --- |
| Restart fails when daemon is busy | Live daemon + `META-BUSY` | `restart` → `success: false` because inner `stop` refuses; daemon still running (no `--force` on restart in v1) |

Single test; documents PRD non-goal.

---

## Docs verification (manual ship checklist)

**File:** `packages/apps/cli/DOCS/commands.md` — section `lumpcode stop`

| Check | Content |
| --- | --- |
| `--force` option documented | Table row + behavior paragraph |
| Busy refusal | When lump run active (`meta.busy`), default stop exits non-zero, suggests wait or `stop --force`, does not signal daemon |
| JSON | `--json` failure includes `code: "daemonBusy"` |
| Force behavior | Tree-kill daemon + descendants; 5s poll; PID/meta removed on success |
| Best-effort caveat | Agents that detach from the process tree may survive |

---

## Test implementation details

### New / updated files

| Path | Action |
| --- | --- |
| `src/utils/killProcessTree/main.ts` | **New** — `killProcessTree({ pid: number }): Promise<Success<void> \| Failure<string>>` |
| `src/utils/killProcessTree/index.ts` | **New** — re-export |
| `src/utils/killProcessTree/unit.test.ts` | **New** |
| `src/utils/readDaemonMeta/main.ts` | Add `busy?: boolean` to schema/types |
| `src/commands/stop/main.ts` | `--force`, busy gate, `daemonBusy` failure payload |
| `src/commands/start/main.ts` | Busy toggle around `runOneLump` |
| `src/testing/processTreeChild.cjs` | **New** — depth tree fixture |
| `src/testing/sigtermIgnorantTreeChild.cjs` | **New** (optional) — SIGTERM ignore + child |
| `src/testing/index.ts` | Export helpers if any shared spawn wrappers added |
| `src/commands/stop/unit.test.ts` | Extend |
| `src/commands/start/unit.test.ts` | Extend |
| `src/utils/readDaemonMeta/unit.test.ts` | Extend |
| `src/commands/restart/unit.test.ts` | One regression case |

### Handler contract for `daemonBusy`

Align with `run` command `workspacePathBusy` JSON pattern:

```ts
return failure({
  messages: [
    'Daemon is running a lump; wait for it to finish or run `lumpcode stop --force`.',
  ],
  data: { code: 'daemonBusy' as const },
});
```

`cliLog` with `--json` emits one JSON line: `{ "messages": [...], "data": { "code": "daemonBusy" } }`.

### Timing constants

Reuse existing stop poll: **5s deadline**, **50ms** sleep between `process.kill(pid, 0)` probes.

### Cleanup discipline

- `afterEach`: `fs.rm` temp dirs; kill stray fixture PIDs on failure.
- Do not write PID/meta under real `~/.lumpcode` — always `setDaemonTestGlobalConfigFolder`.

---

## PRD traceability

| PRD acceptance criterion | Covered by |
| --- | --- |
| `stop` with `busy: true` exits non-zero, message mentions `--force`, `--json` has `daemonBusy`; daemon untouched | §3 — refuses when busy; JSON code; no SIGTERM spy |
| `stop --force` kills daemon + child in Vitest fixture tree; removes PID/meta | §2 killProcessTree; §3 force kills child |
| `stop` when not busy still SIGTERM-only, succeeds within 5s | §3 idle stop unchanged (existing + explicit) |
| Daemon sets/clears `busy` per lump run; meta has no child pid fields | §4 start busy toggle |
| `DOCS/commands.md` updated | Docs verification checklist |

| PRD non-goal | Test plan handling |
| --- | --- |
| Subprocess pid tracking in meta | §4 negative key assertion; §1 schema |
| Cooperative abort / auto-SIGKILL after timeout | Optional negative control only |
| `--force` on `restart` | §5 regression — restart fails when busy |
| Infer busy from workspace locks | Out of scope — no tests |
| E2E | Out of scope — unit only |

---

## Pass criteria

- All new and updated Vitest tests pass on Node 22+ locally.
- CI unit job passes on ubuntu, macOS, and Windows (platform-gated tree-kill cases allowed).
- No `packages/core` changes.
- Default `stop` never signals a busy daemon; PID and meta remain until force or run completion.
- `stop --force` removes PID/meta and eliminates fixture parent **and** child processes in `TREE-PARENT-CHILD`.
- `DOCS/commands.md` ship checklist complete.
