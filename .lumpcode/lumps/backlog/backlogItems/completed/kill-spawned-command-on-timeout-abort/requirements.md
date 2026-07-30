# Requirements: Kill spawned command on timeout and abort

| Field | Value |
| --- | --- |
| **Backlog** | `kill-spawned-command-on-timeout-abort` · priority **1** · type **fix** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary: `packages/core`. Also: `packages/apps/cli` (signal wiring, stop behavior, import moves). Recipes unchanged. |

## Problem statement and motivation

`execBinary` abandons the wait when `timeoutMillis` elapses but does **not** terminate the spawned process. Manual exit (Ctrl+C) and daemon stop can leave the same orphan. Agents such as Copilot CLI keep running under the shared project copy, hold GPU/Ollama models, and refresh keep-alive indefinitely.

Concrete pain:

1. Timed-out `lumpcode run` steps leave agent processes alive.
2. Ctrl+C / parent exit does not reliably reap the in-flight agent tree.
3. Default `lumpcode stop` refuses when `meta.busy === true` (`daemonBusy`), so cooperative cancel of a mid-run daemon is impossible without `--force`.
4. Process-tree kill helpers live only in the CLI, so core cannot kill on timeout.

## Goals

1. On **timeout** and on **AbortSignal**, terminate the spawned command’s **process tree** (SIGTERM, then SIGKILL after grace), then resolve `execBinary` with a structured failure.
2. Thread optional **`signal`** through `RunLumpInput` → `executeStepsForContextList` → `execBinary`.
3. CLI **`run`** and each daemon **`runLumpFromLumpName`** own an `AbortController`; SIGINT/SIGTERM abort the in-flight lump.
4. Default **`lumpcode stop`** cooperatively cancels a busy daemon (no `daemonBusy` refuse); longer wait when busy; `--force` remains immediate tree kill.
5. Move **`killProcessTree`**, **`isProcessAlive`**, and **`nodeErrnoCode`** into `@lumpcode/core`; CLI imports them from core (no local duplicates).
6. Document timeout kill and new stop behavior in CLI DOCS / schema descriptions / `AGENTS.md`.

## Non-goals

- Fixing skipped **`teardownFn` / `teardownWorkspaceFn`** on `stepWalkFailure` (backlog: `execute-steps-teardown-on-failure`).
- User-facing **`Step.killGraceMs`** or lump JSON schema field for kill grace.
- Process-group / `detached` spawn redesign (tree walk by parent PID is enough).
- Killing unrelated Copilot/Cursor processes on the machine (only the spawned command tree).
- Changing `timeoutMillis` defaults.
- Parallel daemon / `inFlightLumpCount` work (`parallel-global-daemon-worktree`).

## User stories / use cases

1. **Operator (timeout)** — A Copilot step hits `timeoutMillis`. Lumpcode kills that agent tree, returns a timeout failure, and does not leave `copilot` holding Ollama.
2. **Operator (Ctrl+C on `run`)** — I interrupt `lumpcode run`. The in-flight agent tree dies; the run fails with abort (not `continueOnError`).
3. **Operator (cooperative stop)** — Global/per-lump daemon is mid-run. `lumpcode stop` SIGTERMs the daemon; it aborts the current lump, unwinds CLI locks, exits within the busy wait window. No `daemonBusy` soft-fail.
4. **Operator (force stop)** — Abort is stuck. `lumpcode stop --force` immediately tree-kills the daemon PID (`graceMs: 0`).
5. **Maintainer** — Unit tests cover timeout kill, abort reason vs `continueOnError`, and stop busy/idle wait without real agents.

## Proposed behavior and UX

### `execBinary` (object API)

```ts
execBinary(input: {
  binaryPath: string;
  args: string[];
  timeoutMillis?: number;           // existing default preserved
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdio?: SpawnOptions['stdio'];
  signal?: AbortSignal;
  killGraceMs?: number;             // default 5000; not on Step / schema
}): Promise<
  Success<{ stdout: string; stderr: string }> |
  Failure<{
    message: string;
    binaryPath: string;
    args: string[];
    code?: number;
    stdout?: string;
    stderr?: string;
    reason?: 'timeout' | 'aborted' | 'exit' | 'spawn';
  }>
>
```

| Event | Kill | `reason` | Message (stable intent) |
| --- | --- | --- | --- |
| `timeoutMillis` elapsed | Tree kill with `killGraceMs` (default 5000) | `timeout` | Process timed out after N milliseconds |
| `signal` aborted (including already aborted before spawn) | Tree kill if child exists | `aborted` | Process aborted |
| Non-zero exit | — | `exit` | Existing style |
| Spawn failure | — | `spawn` | Existing style |

### Step walk / `continueOnError`

| Failure `reason` | `continueOnError` |
| --- | --- |
| `timeout`, `exit`, `spawn`, unset | Honored as today |
| `aborted` | **Ignored** — always set step-walk failure and stop |

### `RunLumpInput` / execute steps

```ts
// additive on RunLumpInput and executeStepsForContextList input
signal?: AbortSignal;
```

Passed into each in-flight `execBinary` call.

### `killProcessTree` (core)

```ts
killProcessTree(input: {
  pid: number;
  graceMs?: number; // default 0 → immediate SIGKILL / taskkill /T /F
}): Promise<Success<void> | Failure<string>>
```

| Caller | `graceMs` |
| --- | --- |
| `execBinary` cancel/timeout | `killGraceMs` (default **5000**) |
| `lumpcode stop --force` | **0** (omit or explicit) |

Also move **`isProcessAlive`** and **`nodeErrnoCode`** to core with the same contracts as today’s CLI utils. CLI deletes local copies and imports from `@lumpcode/core`.

### CLI abort wiring

| Path | Controller |
| --- | --- |
| `lumpcode run` | One `AbortController` around the run; SIGINT/SIGTERM → `abort()` |
| Daemon tick / foreground | New controller per `runLumpFromLumpName`; daemon SIGTERM → `abort()` current controller, then exit scheduler as today |

### `lumpcode stop`

| Case | Behavior |
| --- | --- |
| Idle (`busy` false / unset) | SIGTERM daemon; poll up to **5s**; unlink PID/meta on success |
| Busy (`meta.busy === true`) | SIGTERM daemon (cooperative abort); poll up to **30s**; unlink on success |
| `--force` | `killProcessTree({ pid, graceMs: 0 })`; poll up to **5s** |
| Wait exhausted | Non-zero failure; PID file left (same idea as today). **No** `data.code: "daemonBusy"` |

**Breaking:** remove soft-fail when busy and remove JSON code **`daemonBusy`**.

### Docs / schema copy

| Surface | Change |
| --- | --- |
| `timeoutMillis` (lump-config DOCS + schema description) | State that expiry **terminates** the agent/command process tree, not only abandons the wait |
| `DOCS/commands.md` `stop` | Cooperative cancel when busy; 30s busy wait; no `daemonBusy` |
| `AGENTS.md` | Align daemon stop / kill helpers location |

## Technical approach

| Step | Package / area | Contract change |
| --- | --- | --- |
| 1 | `packages/core` utils | Add `nodeErrnoCode`, `isProcessAlive`, `killProcessTree` (`graceMs`); barrel-export |
| 2 | `packages/core` `execBinary` | Object input; on timeout/abort call `killProcessTree`; set `reason`; update call sites/tests |
| 3 | `packages/core` `executeStepsForContextList` / `runLump` | Accept `signal`; pass to `execBinary`; abort bypasses `continueOnError` |
| 4 | `packages/apps/cli` | Remove local three utils; import from core; wire `AbortController` on `run` + daemon lump runs |
| 5 | `packages/apps/cli` `stop` | Drop busy refuse; 30s busy / 5s idle wait; `--force` uses core `killProcessTree` |
| 6 | Docs + `AGENTS.md` + schema descriptions | Per Docs updates below |

## Testing strategy

| Level | Coverage |
| --- | --- |
| Unit (core) | `execBinary`: timeout kills child tree (fixture that ignores short work); abort before/during spawn; `reason` values; `killGraceMs: 0` for fast tests |
| Unit (core) | `killProcessTree` / `isProcessAlive` / `nodeErrnoCode` (migrate CLI tests) |
| Unit (core) | `executeStepsForContextList`: `continueOnError` + timeout continues; abort stops walk |
| Unit (cli) | `stop`: busy → SIGTERM path (no `daemonBusy`); idle 5s; force `graceMs: 0`; update former `daemonBusy` tests |
| Unit (cli) | Daemon/run signal wiring where practical (abort controller → failure), without real agents |

Existing tests that must change: `execBinary` positional call sites; `packages/apps/cli/src/commands/stop/unit.test.ts` (`daemonBusy`); CLI imports of moved utils; any `killProcessTree` path expectations.

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/cli/DOCS/lump-config.md` | `timeoutMillis`: terminates process tree on expiry |
| `packages/apps/cli/schemas/lumpConfig.schema.json` (or CLI schema path in use) | Same description intent for `timeoutMillis` |
| `packages/apps/cli/DOCS/commands.md` | `stop` cooperative busy cancel; 30s/5s waits; remove `daemonBusy` |
| `packages/core/README.md` | Note timeout/abort kill + `signal` on `RunLumpInput` if command timeout is documented there |
| `AGENTS.md` | Stop busy behavior; kill helpers in core |

## Acceptance criteria

1. After a step `timeoutMillis`, the spawned command PID and its descendants are not left running.
2. Aborting `signal` during a command kills the tree and fails the lump run even when `continueOnError: true`.
3. Timeout with `continueOnError: true` still allows the step walk to continue after kill.
4. `lumpcode run` SIGINT/SIGTERM aborts the in-flight command via `RunLumpInput.signal`.
5. Daemon SIGTERM aborts the current `runLumpFromLumpName` before the daemon process exits.
6. Default `lumpcode stop` while busy does not return `daemonBusy`; it signals the daemon and waits up to 30s.
7. `lumpcode stop --force` still immediate-kills the daemon process tree.
8. CLI has no local `killProcessTree` / `isProcessAlive` / `nodeErrnoCode` implementations; they are exported from `@lumpcode/core`.
9. Docs/schema/`AGENTS.md` match the new timeout and stop contracts.
10. Follow-up backlog item `execute-steps-teardown-on-failure` remains separate (not required for this PR).
