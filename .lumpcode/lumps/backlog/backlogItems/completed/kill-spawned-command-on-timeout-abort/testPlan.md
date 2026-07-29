# Test plan: kill-spawned-command-on-timeout-abort

| Field | Value |
| --- | --- |
| **Backlog** | `kill-spawned-command-on-timeout-abort` |
| **Kind** | Runtime fix (process-tree kill on timeout/abort) + API move + stop UX |
| **Primary packages under test** | `@lumpcode/core` (execBinary, kill helpers, step walk), `@lumpcode/cli` (stop, abort wiring, import moves) |
| **Not under test** | `@lumpcode/recipes`; live Copilot/Cursor/Ollama agents; E2E SEA harness; teardown-on-`stepWalkFailure` (separate backlog) |

Source of truth: [requirements.md](./requirements.md). This plan is the source of truth for the `testImpl` stage.

---

## 1. Goals of the test suite

Prove that after implementation:

1. `execBinary` object API kills the spawned process **tree** on `timeoutMillis` and on `AbortSignal`, then resolves with `reason: 'timeout' | 'aborted'` (and preserves `exit` / `spawn` failures).
2. `killProcessTree` / `isProcessAlive` / `nodeErrnoCode` live in `@lumpcode/core` with the same behavioral contracts as today’s CLI utils (plus `graceMs` on kill).
3. `executeStepsForContextList` honors `continueOnError` for timeout/exit/spawn, but **always** stops the walk on `aborted`.
4. Default `lumpcode stop` SIGTERMs a busy daemon (no `daemonBusy`), waits up to 30s when busy / 5s when idle; `--force` still immediate-kills (`graceMs: 0`).
5. CLI `run` / daemon lump runs pass an `AbortSignal` into `runLump` (assertable without real agents).
6. Existing suites that call `execBinary` positionally or expect `daemonBusy` are updated and green.

Docs/schema/`AGENTS.md` updates are **implementation-stage acceptance**, not automated in `testImpl`.

---

## 2. Testing approach

| Level | Required? | Mechanism |
| --- | --- | --- |
| **Unit (core)** | Yes — primary | Real child processes (node fixtures); Vitest; assert PIDs dead via `process.kill(pid, 0)` / `isProcessAlive` |
| **Unit (cli)** | Yes | Existing stop / run / `runLumpFromLumpName` fixtures; rewrite busy-stop cases; spy `runLump` for signal |
| **Integration / E2E** | No | No live agents; core unit fixtures cover tree kill |

### Prefer real processes over mocks

Match existing `killProcessTree` and `execBinary` suites: spawn real `node` children, assert they exit. Mock only where necessary (CLI signal registration → `runLump` call shape; `process.kill` spies for “was SIGTERM sent”).

### Red → green during `testImpl`

1. Add / migrate failing tests against **current** behavior (timeout leaves children alive; busy stop returns `daemonBusy`; positional `execBinary`).
2. For moved utils: create core stubs that re-export or throw until real move, **or** move files first and leave `execBinary` kill behavior red — either order is fine as long as the suite runs and fails on missing kill/`reason`/`graceMs` until implementation lands.
3. Do **not** implement full product behavior in `testImpl` beyond stubs needed for imports to resolve.

### Fast timeouts

Use `killGraceMs: 0` (and short `timeoutMillis`, e.g. 50–200ms) in unit tests so suites stay fast. Do **not** wait the production default 5000ms grace in CI unit tests except one optional focused case if added later.

---

## 3. File layout (implementation details)

### `@lumpcode/core` — new / extended

| Path | Role |
| --- | --- |
| `packages/core/src/utils/nodeErrnoCode/{main,index,unit.test}.ts` | Migrated from CLI; barrel via `utils/index.ts` |
| `packages/core/src/utils/isProcessAlive/{main,index,unit.test}.ts` | Migrated from CLI |
| `packages/core/src/utils/killProcessTree/{main,index,unit.test}.ts` | Migrated + `graceMs` cases |
| `packages/core/src/testing/processTreeChild.cjs` (or sibling under `killProcessTree/`) | Move/adapt today’s `packages/apps/cli/src/testing/processTreeChild.cjs` |
| `packages/core/src/helpers/execBinary/unit.test.ts` | **Extend**: object API, kill-on-timeout/abort, `reason` |
| `packages/core/src/helpers/executeStepsForContextList/unit.test.ts` | **Extend**: timeout + `continueOnError`; abort bypasses `continueOnError` |
| `packages/core/src/utils/index.ts` / package root | Export the three helpers |

`pollUntil` stays CLI-only. Core tests that need “wait until dead” should use a **local** poll helper in the test file (copy the small `waitForPidGone` pattern from today’s CLI `killProcessTree` suite), not a new shared util unless one already exists in core.

### `@lumpcode/cli` — update / delete

| Path | Role |
| --- | --- |
| `packages/apps/cli/src/utils/{killProcessTree,isProcessAlive,nodeErrnoCode}/` | **Delete** local implementations + unit tests after migrate |
| `packages/apps/cli/src/utils/index.ts` | Stop exporting local copies; callers import from `@lumpcode/core` (or thin re-export from core if a transitional barrel is kept — prefer direct core imports) |
| `packages/apps/cli/src/commands/stop/unit.test.ts` | **Rewrite** busy / `daemonBusy` cases; keep idle / force / SIGTERM-ignore timeout |
| `packages/apps/cli/src/commands/run/unit.test.ts` | Assert `runLump` (via `runLumpFromLumpName` mock path) receives `signal` |
| `packages/apps/cli/src/utils/runLumpFromLumpName/unit.test.ts` | Assert forwarded `signal` on `core.runLump` (and/or accept optional injected signal) |

Run:

```bash
npm run test -w=@lumpcode/core
npm run test -w=@lumpcode/cli
```

---

## 4. Shared test data / fixtures

### 4.1 Long-lived child (execBinary kill proofs)

Prefer `node -e` / small inline script that:

1. Writes `process.pid` (and optionally child PIDs) to a temp ready file under the test `tmpDir`.
2. Spawns one grandchild when testing tree kill (or reuse `processTreeChild.cjs` with depth ≥ 1).
3. Stays alive (`setInterval` / `sleep`) until killed.

**Do not** use `sleep` alone on platforms where timeout historically abandons without kill — always capture PID(s) from the ready file and assert they are gone after `execBinary` resolves.

Example shape (conceptual — adapt to object API):

```ts
// ready file: { "pids": [root, ...descendants] }
// spawn via execBinary({ binaryPath: process.execPath, args: [script, ...], timeoutMillis: 80, killGraceMs: 0, cwd: tmpDir })
```

### 4.2 Process tree fixture (killProcessTree)

Reuse migrated `processTreeChild.cjs` with `LUMPCODE_TREE_CHILD_DEPTH` / `LUMPCODE_TREE_READY_FILE` (same env contract as today).

### 4.3 SIGTERM-ignorant daemon (stop wait exhaustion)

Reuse CLI `packages/apps/cli/src/testing/sigtermIgnorantTreeChild.cjs` and the existing `spawnSigtermIgnorantDaemon` helper pattern in `stop/unit.test.ts`.

### 4.4 AbortSignal

```ts
const controller = new AbortController();
// before spawn:
controller.abort();
// during spawn:
queueMicrotask(() => controller.abort()); // or setTimeout(0) after ready file appears
```

### 4.5 Step-walk minimal git repo

Reuse `executeStepsForContextList` helpers already in that suite (`initTestGitRepo`, stub git/branch/workspace fns). Commands under test:

| Case | Command descriptor |
| --- | --- |
| Timeout | Long-running node/script + `timeoutMillis: 80`, `killGraceMs` threaded if exposed only via execBinary (step has `timeoutMillis` only — grace stays execBinary default or test uses a short-lived fixture) |
| Abort | Same long runner; pass `signal` on `executeStepsForContextList` input; abort after start |
| Exit (baseline) | Existing `sh -c 'exit 1'` cases stay |

Note: `killGraceMs` is **not** on `Step` / schema. Step-walk tests exercise timeout/abort via `timeoutMillis` + input `signal` only; force `killGraceMs: 0` only in direct `execBinary` tests.

### 4.6 Stop fixtures

Existing stop suite pieces:

- Temp project + `local.json` dedicated + minimal lump `config.json`
- `aliveDaemonSpawnFn` + `waitForDaemonPidFile`
- `writeBusyMeta({ busy: true })`
- Per-lump PID path `${projectName}.alpha.daemon.pid`

---

## 5. Test cases

Each case: **ID**, **setup/data**, **expectation**, **where**.

### 5.1 `nodeErrnoCode` (core — migrate)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| N1 | String Node errno | `Object.assign(new Error('x'), { code: 'ENOENT' })` | Returns `'ENOENT'` |
| N2 | Non-string code | `{ code: 1 }` | `undefined` |
| N3 | No code / non-object | `new Error('plain')`, `'ENOENT'`, `null` | `undefined` |

**Where:** `packages/core/src/utils/nodeErrnoCode/unit.test.ts` (move existing CLI cases verbatim).

### 5.2 `isProcessAlive` (core — migrate)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| A1 | Current process | `process.pid` | `true` |
| A2 | Missing pid | `2_000_000_000` | `false` |
| A3 | Non-ESRCH rethrows | mock `process.kill` → `EPERM` | Throws by default |
| A4 | `onProbeError: 'alive'` | same mock | `true` |
| A5 | `onProbeError: 'dead'` | same mock | `false` |

**Where:** `packages/core/src/utils/isProcessAlive/unit.test.ts`.

### 5.3 `killProcessTree` (core — migrate + graceMs)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| K1 | Single process | depth `0` tree | `success`; all ready-file PIDs dead |
| K2 | Parent + child | depth `1` | All PIDs dead |
| K3 | Deep tree | depth `2` | All PIDs dead |
| K4 | Idempotent dead pid | kill then call again | `success` |
| K5 | Invalid pid | `0`, `-1`, `1.5` | `failure` string mentions invalid pid |
| K6 | `graceMs: 0` (default) | normal tree | Immediate kill path; PIDs dead without waiting production grace |
| K7 | `graceMs > 0` + SIGTERM-compliant child | child exits on SIGTERM; `graceMs: 200` | `success`; child dead (may exit during grace without needing SIGKILL) |
| K8 | `graceMs > 0` + SIGTERM-ignorant child | fixture ignores SIGTERM; `graceMs: 100` | After grace, SIGKILL/taskkill; PIDs dead; `success` |

**Where:** `packages/core/src/utils/killProcessTree/unit.test.ts`.

**Impl notes:** K7/K8 need a small fixture that optionally ignores SIGTERM (CLI already has `sigtermIgnorantTreeChild.cjs` — copy a minimal variant into core testing, or spawn `node -e` with `process.on('SIGTERM', () => {})` + interval). On win32, SIGTERM semantics differ; use `it.skipIf(process.platform === 'win32')` for Unix-signal-specific grace cases if needed, but keep K1–K6 cross-platform (existing suite already is).

### 5.4 `execBinary` (core — extend)

Update all call sites in this file to the **object API**. Preserve existing success / non-zero exit / spawn ENOENT / win32 shim cases; add kill/`reason` coverage.

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| E1 | Success | `{ binaryPath: 'echo', args: ['Hello, world!'] }` (or `node -e` print) | `success`; stdout contains payload |
| E2 | Non-zero exit | `node -e process.exit(1)` | `failure`; `reason: 'exit'`; `code: 1` |
| E3 | Spawn failure | missing `cwd` | `failure`; `reason: 'spawn'`; message matches `/ENOENT/i` |
| E4 | Timeout abandons **and kills** | long-lived fixture; `timeoutMillis: 80`; `killGraceMs: 0`; capture PIDs from ready file | `failure`; `reason: 'timeout'`; message contains `timed out` / `N milliseconds`; **all PIDs dead** within a few seconds |
| E5 | Timeout kills descendants | fixture with depth ≥ 1 (or parent+child) | Same as E4 for every PID in ready file |
| E6 | Abort before spawn | `signal` already aborted; short command | `failure`; `reason: 'aborted'`; message intent “Process aborted”; no orphan (no child, or child killed if raced) |
| E7 | Abort during run | start long-lived fixture; abort after ready file; `killGraceMs: 0` | `failure`; `reason: 'aborted'`; PIDs dead |
| E8 | Object API shape | any failure | Failure data includes `binaryPath`, `args`, optional `stdout`/`stderr`/`code`, and `reason` |
| E9 | win32 shim cases | existing PATH `.cmd` fixtures | Still pass under object API (`it.skipIf` non-win32) |

**Where:** `packages/core/src/helpers/execBinary/unit.test.ts`.

**Critical assertion for E4/E5/E7:** After await, for each pid: `isProcessAlive(pid) === false` (or `process.kill(pid, 0)` throws `ESRCH`). Today’s suite only checks the timeout **message** — that is insufficient and must be upgraded.

### 5.5 `executeStepsForContextList` (core — extend)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| S1 | Timeout + `continueOnError: true` | Step 1: long runner, `timeoutMillis: 80`, `continueOnError: true`; Step 2: `echo reached` (track via `postCommandExecFn` / history / side-effect file) | Walk **continues**; overall `success: true`; step 2 ran; step-1 command tree dead |
| S2 | Timeout + default `continueOnError` | Same timeout step without continue; second step should not run | `success: false`; step-walk failure message includes command failure / timed out; tree dead |
| S3 | Abort + `continueOnError: true` | Long runner; `continueOnError: true`; input `signal` aborted mid-run; second step present | Walk **stops**; `success: false`; second step **not** executed; tree dead |
| S4 | Abort already aborted before first command | `signal` aborted before `executeStepsForContextList`; one command step | Fails without leaving orphans; does not honor continueOnError |
| S5 | Exit + `continueOnError` regression | Existing `exit 1` + continue case | Still `success: true` and post/dynamic order unchanged |

**Where:** `packages/core/src/helpers/executeStepsForContextList/unit.test.ts`.

**Impl notes:** Prefer side-effect markers (`executionOrder` array / temp file) over mocking `execBinary`. Pass `signal` on the execute-steps input object per requirements. For S1, assert kill via PID file written by the step command script under `projectRoot` tmp.

### 5.6 CLI `stop` (rewrite busy behavior)

Replace cases that refuse busy / assert `daemonBusy`.

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| ST1 | Busy → cooperative SIGTERM | `aliveDaemonSpawnFn`; write `busy: true` meta; default stop | `success: true`; PID + meta unlinked; process dead; **no** `data.code: 'daemonBusy'` |
| ST2 | Busy + `--json` | same | Success JSON has **no** `daemonBusy`; messages indicate stopped (not “wait or --force” refuse) |
| ST3 | Busy sends SIGTERM | same; spy `process.kill` | At least one `SIGTERM` to daemon pid |
| ST4 | Per-lump busy stop | per-lump daemon + busy meta; `lumpName: 'alpha'` | Same cooperative success as ST1 for lump PID path (not refuse) |
| ST5 | Idle stop within 5s | idle alive daemon | Unchanged success + unlink (existing) |
| ST6 | `--force` while busy | busy meta + force | Success; artifacts gone; process dead (existing) |
| ST7 | `--force` kills child tree | `spawnSigtermIgnorantDaemon` + force | Root + children dead (existing) |
| ST8 | Idle SIGTERM-ignore still times out ~5s | sigterm-ignorant, **not** busy | Failure “did not exit within”; PID file left; process still alive (existing) |
| ST9 | Busy SIGTERM-ignore times out ~30s | sigterm-ignorant + `busy: true`; default stop | Failure after busy wait (message “did not exit”); PID file left; **no** `daemonBusy`; process still alive |
| ST10 | `--force` uses immediate kill | force path | Behaviorally `graceMs: 0` (tree dead quickly); if `killProcessTree` is spyable, assert called with `graceMs: 0` or omitted (default 0) |

**Where:** `packages/apps/cli/src/commands/stop/unit.test.ts`.

**Impl notes:**

- Delete / rewrite: `refuses when meta.busy is true`, `returns JSON code daemonBusy when busy`, `does not SIGTERM the daemon when busy`, `refuses per-lump busy stop…`.
- ST9: set Vitest test timeout ≥ 35_000ms; assert elapsed wait is clearly > 5s when distinguishing idle vs busy wait (optional timing assertion; message + lack of `daemonBusy` is enough if flaky).
- Do not require a real mid-run lump — busy meta file is sufficient for stop’s decision, same as today’s suite.

### 5.7 CLI abort wiring (practical, no real agents)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| W1 | `runLumpFromLumpName` passes `signal` | Mock `core.runLump`; happy-path lump fixture; call `runLumpFromLumpName` | `runLump` called with an object that includes `signal` instanceof `AbortSignal` (or equal to injected controller.signal) |
| W2 | `run` handler wires controller | Spy `runLumpFromLumpName` **or** assert via W1 if run only delegates; if run owns the controller, spy that the signal passed down is not aborted initially | Call receives a live `AbortSignal` |
| W3 | AbortController abort surface | Optional: inject / expose test hook **or** call the same helper run uses; `controller.abort()` then observe mocked `runLump` that rejects/returns when `signal.aborted` | Prefer testing at `executeSteps` / `execBinary` (S3/E7) for kill semantics; W1–W2 only prove the wire exists |

**Where:** `packages/apps/cli/src/utils/runLumpFromLumpName/unit.test.ts` and/or `packages/apps/cli/src/commands/run/unit.test.ts`. Daemon SIGTERM → abort can be a thin unit test of the tick/onSignal handler if easily extracted; otherwise W1 + core abort cases cover AC5 risk. Do **not** require full daemon E2E for this backlog.

### 5.8 Import move smoke (cli)

| ID | Case | Expectation |
| --- | --- | --- |
| M1 | No local util directories | After migrate, `packages/apps/cli/src/utils/{killProcessTree,isProcessAlive,nodeErrnoCode}/` absent (or empty re-export-only shims — prefer absent) |
| M2 | Core exports | `import { killProcessTree, isProcessAlive, nodeErrnoCode } from '@lumpcode/core'` resolves in a small core or cli test |
| M3 | Call sites compile | `stop/main.ts` and any other former importers build under `npm run test -w=@lumpcode/cli` |

M1 may be enforced by deleting the directories in implementation; `testImpl` can add M2 as an explicit import smoke `it` if useful.

---

## 6. Existing tests that must change

| Location | Why |
| --- | --- |
| `packages/core/src/helpers/execBinary/unit.test.ts` | Positional → object API; timeout case must assert process death + `reason` |
| Any other `execBinary(` call sites in core/cli tests | Signature change |
| `packages/apps/cli/src/utils/killProcessTree/unit.test.ts` (and siblings) | Move to core; delete CLI copies |
| `packages/apps/cli/src/commands/stop/unit.test.ts` | Remove `daemonBusy` / refuse-busy assertions; add cooperative busy + 30s wait cases |
| CLI modules importing local kill helpers | Import from `@lumpcode/core` |

---

## 7. Out of scope (explicit)

| Item | Why |
| --- | --- |
| Live Copilot/Cursor/Ollama processes | Requirements: unit fixtures only |
| `Step.killGraceMs` / schema field | Non-goal |
| `teardownFn` on `stepWalkFailure` | Separate backlog |
| Docs / schema / `AGENTS.md` content snapshots | Implementation acceptance |
| Parallel daemon / `inFlightLumpCount` | Non-goal |
| Full E2E Ctrl+C of `lumpcode run` | Covered by signal unit + execBinary abort |

---

## 8. Acceptance mapping

| Requirements acceptance | Covered by |
| --- | --- |
| AC1 — timeout kills tree | E4, E5, S1/S2 |
| AC2 — abort kills + ignores `continueOnError` | E6, E7, S3, S4 |
| AC3 — timeout + `continueOnError` continues | S1 |
| AC4 — `run` SIGINT/SIGTERM → signal | W1, W2 (+ core abort) |
| AC5 — daemon SIGTERM aborts current lump | W1 (signal into `runLump`) + optional daemon onSignal unit; kill proven by E7/S3 |
| AC6 — busy stop no `daemonBusy`, wait 30s | ST1–ST4, ST9 |
| AC7 — `--force` immediate tree kill | ST6, ST7, ST10 |
| AC8 — helpers in core, no CLI locals | N/A migrate + M1–M3, K*, A*, N* |
| AC9 — docs/schema/AGENTS | Implementation acceptance (not `testImpl`) |
| AC10 — teardown backlog separate | Out of scope |

---

## 9. Commands to run

```bash
npm run test -w=@lumpcode/core
npm run test -w=@lumpcode/cli
```

Optional focus during red/green:

```bash
npm run test -w=@lumpcode/core -- src/helpers/execBinary/unit.test.ts
npm run test -w=@lumpcode/core -- src/utils/killProcessTree/unit.test.ts
npm run test -w=@lumpcode/core -- src/helpers/executeStepsForContextList/unit.test.ts
npm run test -w=@lumpcode/cli -- src/commands/stop/unit.test.ts
```

---

## 10. Implementation-stage checklist (not automated here)

Confirm manually / by review when implementing:

- [ ] `timeoutMillis` DOCS + schema text say expiry **terminates** the process tree
- [ ] `DOCS/commands.md` stop: cooperative busy cancel; 30s/5s; no `daemonBusy`
- [ ] `AGENTS.md`: kill helpers in core; stop busy behavior
- [ ] `packages/core/README.md` notes timeout/abort kill + `signal` if timeouts are documented there
