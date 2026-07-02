# Test plan: Daemon stop mid-run (`stop --force`, `meta.busy`)

| Field | Value |
| --- | --- |
| **Backlog** | `daemon-stop-mid-run` · priority **2** · type **bugfix** |
| **PRD** | [daemon-stop-mid-run.prd.md](../prds/daemon-stop-mid-run.prd.md) |
| **Packages** | `packages/apps/cli` only |
| **Out of scope** | Core / `execBinary` changes; pid collection in meta; cooperative abort; `restart --force`; busy detection from lock files or heuristics outside meta; detached-agent survival guarantees beyond best-effort docs |

## Summary

Verify **`meta.busy`** is toggled by the foreground daemon around blocking lump work, **`lumpcode stop`** refuses to signal a busy daemon (info message, non-zero exit, PID/meta preserved), **`lumpcode stop --force`** SIGKILLs the daemon process tree discovered at stop time (no pre-collected child pids), idle **`stop`** still uses SIGTERM-only within 5s, and **`DOCS/commands.md`** documents `--force`, the busy message, tree kill, and best-effort detached-agent caveat.

**Scope:** ~22–28 `it()` blocks across one new util test file, extensions to `stop` / `start` / `readDaemonMeta` unit tests, one shared testing fixture, and one optional E2E scenario.

### Layering

| Layer | Files | Responsibility |
| --- | --- | --- |
| Process tree kill | `utils/killProcessTree/unit.test.ts` | Unix descendant discovery + deepest-first SIGKILL; Windows `taskkill /T /F` branch |
| Meta schema | `utils/readDaemonMeta/unit.test.ts` | Optional `busy?: boolean` parse/round-trip |
| Stop command | `commands/stop/unit.test.ts` | Busy refusal, `--force` tree kill, idle SIGTERM regression |
| Start command | `commands/start/unit.test.ts` | `busy` toggle around `runLumpFromJsConfig`; no child pid fields |
| Restart (regression) | `commands/restart/unit.test.ts` | Busy daemon blocks restart (stop step fails; no `--force` in v1) |
| E2E (optional) | `e2e/daemon-scenarios.test.ts` | Subprocess busy + `--force` against real CLI |

## Test environment

- **Node:** 22+
- **Runner:** Vitest (`npm run test` in `packages/apps/cli`)
- **Conventions:** temp `projectRoot` / `globalConfigFolderPath`; local git `user.name` / `user.email` before commits; real `spawn` process trees over mocking `process.kill`; `cwd` option with `execAsync` / `child_process` (no `cd &&` chains); teardown via `fs.rm` on temp dirs and best-effort `SIGKILL` on stray fixture pids in `afterEach`
- **Daemon tests:** `setDaemonTestGlobalConfigFolder`, `aliveDaemonSpawnFn`, `waitForDaemonPidFile` from `testing/`
- **E2E:** rebuild `build:bundle` + `build:sea` after CLI changes before `npm run test:e2e`

### Commands

```bash
cd packages/apps/cli && npm run test
cd packages/apps/cli && npm run test -- src/utils/killProcessTree/unit.test.ts
cd packages/apps/cli && npm run test -- src/commands/stop/unit.test.ts
cd packages/apps/cli && npm run test:e2e
```

---

## Test data

### Daemon meta fixtures

Written under `<globalConfigFolderPath>/daemons/<projectName>.daemon.meta.json` (or per-lump `.<lumpName>.daemon.meta.json`).

| ID | JSON body | Used for |
| --- | --- | --- |
| `META-IDLE` | `{ "cronSetup": "*/5 * * * *", "workspaceStrategy": "checkout" }` | Default idle stop (no `busy` key) |
| `META-IDLE-FALSE` | `{ "cronSetup": "*/5 * * * *", "workspaceStrategy": "checkout", "busy": false }` | Explicit not-busy |
| `META-BUSY` | `{ "cronSetup": "*/5 * * * *", "workspaceStrategy": "checkout", "busy": true }` | Default stop refusal |
| `META-BUSY-LUMP` | `{ "cronSetup": "*/5 * * * *", "workspaceStrategy": "worktree", "lumpName": "alpha", "busy": true }` | Per-lump scoped stop |

**Negative:** meta must **not** contain `activeChildPid`, `childPid`, or any pid-list fields (assert via snapshot / key enumeration in start tests).

### Busy info message (exact PRD text)

Default `stop` when `meta.busy === true` must surface this string in the handler `messages` array (printed via `cliLog` for both plain and `--json`):

```text
Daemon is running a lump (agent or other long work). Wait for it to finish, or run `lumpcode stop --force` to kill the process and its subprocesses.
```

### Process-tree fixture processes

| ID | Shape | Purpose |
| --- | --- | --- |
| `TREE-SINGLE-CHILD` | daemon (parent) → one long-lived child (`node` sleep script) | PRD acceptance: `--force` kills daemon **and** direct child without meta pid tracking |
| `TREE-GRANDCHILD` | parent → child → grandchild (all sleep) | Deepest-first kill order; no orphan grandchild |
| `TREE-STALE-PID` | parent already exited; PID file points at dead pid | Existing stale cleanup unchanged; `--force` on stale pid cleans artifacts |

**Fixture script:** `packages/apps/cli/src/testing/processTreeFixture.cjs`

- **Parent mode** (`node processTreeFixture.cjs parent [--depth N]`): writes nothing; spawns one child (or chain when `depth=2`); parent sleeps until killed.
- **Child mode** (invoked internally): `setInterval(() => {}, 60_000)` until killed.

Parent pid is the “daemon” pid for `killProcessTree` / `stop --force` tests.

### Minimal lump project fixture (reuse stop tests)

Same layout as existing `commands/stop/unit.test.ts`:

- `projectName`: `stop-test-project`
- `local.json`: `{ "mode": "dedicated", "discoveryBranch": "main" }`
- Lump `alpha` with minimal runnable `config.json` (existing `minimalLumpConfigJson`)

### Start busy-toggle injection

| ID | Injection | Behavior |
| --- | --- | --- |
| `START-SLOW-RUN` | `vi.mock('../../utils/runLumpFromJsConfig')` returning a `Promise` resolved only after test reads meta | Observe `busy: true` while promise pending |
| `START-RUN-DONE` | Same mock resolving immediately | `busy` cleared / omitted after tick lump work |

Use foreground `start` with `waitForShutdownOverride` so the handler returns after one tick (existing pattern in `start/unit.test.ts`).

---

## Automated tests

### 1. `killProcessTree` (new util)

**File:** `packages/apps/cli/src/utils/killProcessTree/unit.test.ts`

Export `killProcessTree({ rootPid: number }): Promise<Success<void> | Failure<string>>` from `utils/killProcessTree/main.ts`; barrel-export from `utils/index.ts`.

| `it()` | Fixture | Expectation |
| --- | --- | --- |
| Kills parent and direct child (`TREE-SINGLE-CHILD`) | Spawn parent via `processTreeFixture.cjs`; record parent + child pids (`pgrep -P` or parse spawn) | After `killProcessTree`, `process.kill(pid, 0)` throws `ESRCH` for **both** pids |
| Kills grandchild deepest-first (`TREE-GRANDCHILD`) | `depth=2` | All three pids gone; no surviving descendant |
| Ignores `ESRCH` for pid that exited between snapshot and kill | Start parent, kill child manually, then `killProcessTree(parent)` | Resolves success; parent pid gone |
| Does not kill unrelated process | Spawn fixture parent + separate sleeper process unrelated in tree | Unrelated pid still alive after `killProcessTree(fixtureParent)` |
| Windows tree kill | `process.platform === 'win32'` only | Spawns `cmd /c ping -t localhost` tree; `killProcessTree` succeeds; `tasklist` / `process.kill(0)` shows target gone |

**Implementation notes:**

- Use `spawn` with `cwd` pointing at fixture script directory; `stdio: 'ignore'`.
- Poll up to 5s (50ms interval) for pid liveness, matching stop deadline.
- Unix: assert SIGKILL via `process.kill` only (no shell `kill -9` unless an edge case requires `execAsync`).
- `afterEach`: best-effort `killProcessTree` on any fixture root still alive.

---

### 2. `readDaemonMeta` — `busy` field

**File:** `packages/apps/cli/src/utils/readDaemonMeta/unit.test.ts` (extend)

| `it()` | Input | Expectation |
| --- | --- | --- |
| Reads `busy: true` from meta | `META-BUSY` | `result.data.busy === true` |
| Omits `busy` when absent | `META-IDLE` | `busy` undefined on returned object |
| Reads `busy: false` | `META-IDLE-FALSE` | `busy === false` (or omitted after normalization — document chosen behavior; PRD allows omit or false when idle) |
| Invalid non-boolean `busy` | `{ "busy": "yes", … }` | Falls back to default meta (existing invalid-field behavior) or Zod strip — match implementation; must not treat string as busy |

Extend `DaemonMeta` / `daemonMetaSchema` with `busy: z.boolean().optional()` only.

---

### 3. `stop` command

**File:** `packages/apps/cli/src/commands/stop/unit.test.ts` (extend)

Add `force: z.boolean().optional().describe('SIGKILL the daemon and all descendant processes')` to `inputSchema.options`.

| `it()` | Setup | Options | Expectation |
| --- | --- | --- | --- |
| Refuses when meta busy (plain) | `aliveDaemonSpawnFn` start + write `META-BUSY` over meta | `{}` | `success === false`; message equals busy info text; PID file exists; daemon pid still alive (`process.kill(pid, 0)` succeeds) |
| Refuses when meta busy (`--json`) | same | `{ json: true }` | Same message in `messages`; still failure; pid/meta preserved |
| Does not send SIGTERM when busy | busy daemon; spy `vi.spyOn(process, 'kill')` | `{}` | No `kill(pid, 'SIGTERM')` call |
| `--force` kills busy daemon and child (`TREE-SINGLE-CHILD`) | Spawn `processTreeFixture.cjs parent`; write pid + `META-BUSY` meta | `{ force: true }` | `success === true`; message mentions forced stop / subprocesses; PID + meta files removed; parent **and** child pids dead |
| `--force` removes PID/meta after tree kill | same as above | `{ force: true }` | `fs.access(pidPath)` and `metaPath` → `ENOENT` |
| `--force` skips busy check | busy meta + idle daemon (`aliveDaemonSpawnFn`) | `{ force: true }` | Succeeds even with `busy: true` in meta |
| Idle stop still SIGTERM-only (regression) | `aliveDaemonSpawnFn` start; `META-IDLE` meta | `{}` | Existing test behavior: SIGTERM, success within 5s, pid/meta removed; spy shows no `SIGKILL` on daemon pid |
| Per-lump scoped busy stop | meta at `${projectName}.alpha.daemon.*` with `META-BUSY-LUMP` | `{ lumpName: 'alpha' }` | Busy refusal scoped correctly |
| Stale pid unchanged | existing stale test | `{}` | Still cleans stale file without `--force` |

**Handler injection (optional):** allow `killProcessTree` inject for unit isolation; prefer integration-style test with real fixture tree for PRD acceptance criterion #2.

**Success message (`--force`):** assert message notes forced stop (exact wording left to implementation; must mention force and subprocess targeting per PRD).

---

### 4. `start` command — `meta.busy` lifecycle

**File:** `packages/apps/cli/src/commands/start/unit.test.ts` (extend)

Requires meta **update** helper (e.g. `updateDaemonMetaFile(metaFilePath, patch)` private to start or shared util) that merges `busy` into existing `DaemonMetaWrite` fields without dropping `cronSetup` / `workspaceStrategy` / `lumpName`.

| `it()` | Setup | Expectation |
| --- | --- | --- |
| Sets `busy: true` during `runLumpFromJsConfig` | `START-SLOW-RUN` mock; foreground start; read meta while promise pending | `busy === true`; other meta fields preserved |
| Clears `busy` after lump run completes | resolve slow mock; read meta after tick | `busy` false or key absent |
| Clears `busy` after lump run fails | mock rejected / failure result from `runLumpFromJsConfig` | `busy` cleared |
| Clears `busy` after skipped lump | mock `skipped` variant | `busy` cleared |
| No child pid fields in meta at any time | poll meta during slow run | `Object.keys(meta)` never includes `activeChildPid` / `childPid` / similar |
| Idle between ticks omits `busy` | two-tick test with fast mock + `waitForShutdownOverride` after tick 2 | Meta read before second tick has no `busy: true` |

**Boundary:** `busy` covers the blocking window from lump execution entry through `runLumpFromJsConfig` return (per PRD), including pre-flight inside `runOneLump` if that is part of the blocking path before return — tests should observe busy true during the mocked await even when pre-flight runs first.

**Non-busy paths (no false positive):**

| `it()` | Expectation |
| --- | --- |
| Tick skips all lumps (project `disabled: true` in `local.json`) | Meta never sets `busy: true` |
| Tick finds zero runnable lumps | Meta never sets `busy: true` |

---

### 5. `restart` — busy daemon regression (non-goal: no `--force`)

**File:** `packages/apps/cli/src/commands/restart/unit.test.ts` (extend)

| `it()` | Setup | Expectation |
| --- | --- | --- |
| Fails when daemon busy | running daemon + `META-BUSY` | `restart` fails; stop-phase message matches busy info; daemon still running; start not attempted (spy `spawnFn` call count unchanged from stop-only failure) |

Documents v1 behavior until follow-up adds `restart --force`.

---

## E2E scenarios (optional)

| ID | Scenario | Steps | Expectation |
| --- | --- | --- | --- |
| `DAEMON-S6` | Busy refusal | Foreground `start` with mock slow agent lump (extend e2e agent script to sleep until signaled); while marker/log shows active run, `lumpcode stop --json` | Failure envelope contains busy message; pid file still present |
| `DAEMON-S7` | Force stop mid-run | Same slow lump; `lumpcode stop --force --json` | Success; pid/meta gone; no orphan `node` mock-agent children (`pgrep` / process check) |

Harness: reuse `runForegroundUntilMarkers` / `createProject`; add `slowAgent: true` on lump spec or dedicated slow e2e command module. Tear down via `stop --force` in `afterEach` if normal `stop` fails.

E2E is **optional** for PRD acceptance (Vitest fixture tree satisfies criterion #2); run on CI matrix when slow-agent timing is stable.

---

## Test implementation details

### New modules

| Path | Export |
| --- | --- |
| `utils/killProcessTree/main.ts` | `killProcessTree({ rootPid })` |
| `utils/killProcessTree/index.ts` | re-export |
| `testing/processTreeFixture.cjs` | parent/child/grandchild sleep tree |
| `testing/processTreeFixture.ts` (optional) | `spawnProcessTreeFixture({ depth?: 1 \| 2 })` → `{ rootPid, childPid?, grandchildPid? }` |

Barrel-export `killProcessTree` from `utils/index.ts`. Stub throws `not implemented` until implementation (red-first per AGENTS.md).

### Files to update

| File | Action |
| --- | --- |
| `commands/stop/main.ts` | `--force`; read meta; busy guard; call `killProcessTree` on force path |
| `commands/stop/unit.test.ts` | Sections §3 |
| `commands/start/main.ts` | Toggle `busy` in meta around lump work; use meta merge write |
| `commands/start/unit.test.ts` | Section §4 |
| `utils/readDaemonMeta/main.ts` | `busy?: boolean` on schema + types |
| `utils/readDaemonMeta/unit.test.ts` | Section §2 |
| `DOCS/commands.md` | `--force`, busy message, tree kill, detached-agent best-effort |

### Assertion snippets

Busy refusal:

```ts
const result = await makeStopHandler()({ options: {}, arguments: {} });
expect(result.success).toBe(false);
expect(result.data.messages.join('\n')).toContain(
    'Daemon is running a lump (agent or other long work)',
);
expect(result.data.messages.join('\n')).toContain('lumpcode stop --force');
await expect(fs.access(pidPath())).resolves.toBeUndefined();
process.kill(daemonPid, 0); // still alive
```

Force kill tree:

```ts
const tree = await spawnProcessTreeFixture({ depth: 1 });
await writePidAndMeta(tree.rootPid, META_BUSY);
const result = await makeStopHandler()({ options: { force: true }, arguments: {} });
expect(result.success).toBe(true);
for (const pid of [tree.rootPid, tree.childPid!]) {
    expect(() => process.kill(pid, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }));
}
```

Meta busy during run:

```ts
let releaseRun!: () => void;
const runPromise = new Promise<void>((r) => { releaseRun = r; });
vi.mocked(runLumpFromJsConfig).mockReturnValue(runPromise as never);
// start foreground tick...
const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
expect(meta.busy).toBe(true);
expect(meta).not.toHaveProperty('activeChildPid');
releaseRun();
// await handler completion...
const metaAfter = JSON.parse(await fs.readFile(metaPath, 'utf8'));
expect(metaAfter.busy).not.toBe(true);
```

JSON envelope busy message:

```ts
// When wired through addCommand integration test or cliLog simulation:
cliLog(result.data, true, true);
// expect single-line JSON with messages containing busy text
```

### Platform matrix

| Behavior | macOS / Linux CI | Windows CI |
| --- | --- | --- |
| `killProcessTree` unit tests | `TREE-*` fixtures | `taskkill /T /F` case |
| `stop --force` integration | Full tree assertion | Full tree assertion |
| Busy meta tests | platform-agnostic | platform-agnostic |

---

## Ship checklist

| File | Check |
| --- | --- |
| `DOCS/commands.md` | `--force` option; busy info message; SIGKILL tree behavior; best-effort detached-agent caveat |
| `commands/stop/main.ts` description string | Mentions `--force` |
| `AGENTS.md` | Daemon stop / `meta.busy` workspace facts (when implementing) |

---

## PRD traceability

| PRD acceptance | Criterion | Covered by |
| --- | --- | --- |
| AC-1 | `stop` with `busy: true` prints info, does not kill | §3 (refuses when busy plain + `--json`; no SIGTERM spy) |
| AC-2 | `stop --force` kills busy daemon + direct child in fixture | §1 (`TREE-SINGLE-CHILD`), §3 (`--force` integration) |
| AC-3 | `stop --force` removes PID/meta | §3 |
| AC-4 | Idle `stop` SIGTERM-only within 5s | §3 (regression) |
| AC-5 | Daemon sets/clears `busy`; no child pid fields | §4 |
| AC-6 | `DOCS/commands.md` updated | Ship checklist |
| Busy flag spec | Only `busy` in meta | §4 (key enumeration) |
| Process tree | ps/pgrep discovery, deepest-first, no pre-collected pids | §1, §3 |
| Windows | `taskkill /PID /T /F` | §1 |
| Non-goals | No restart `--force`; no core changes | §5, Out of scope |

## Pass criteria

- All new and updated Vitest tests in `packages/apps/cli` pass on the developer’s platform.
- `killProcessTree` and `stop --force` tests use real child processes, not mocked trees.
- Busy refusal preserves PID file and live daemon process.
- Optional E2E `DAEMON-S6` / `DAEMON-S7` pass after `build:bundle` + `build:sea` when enabled.
- No changes required in `packages/core` tests.
- Manual smoke (operator): start foreground daemon on a slow lump, confirm default `stop` prints busy guidance, `stop --force` clears pid and leaves no agent orphan in `ps`.
