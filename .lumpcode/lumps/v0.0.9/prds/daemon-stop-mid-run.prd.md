# PRD: `stop --force` when daemon is mid-run

| Field | Value |
| --- | --- |
| **Backlog** | `daemon-stop-mid-run` · priority **2** · type **bugfix** |
| **Release goal** | [GOALS.md](../GOALS.md) — v0.0.9 |
| **Packages** | `packages/apps/cli` only |
| **Related** | Branch workspace lock stale-PID recovery (unchanged) |

## Problem

`lumpcode stop` sends SIGTERM and waits 5 seconds. If the daemon is blocked in a lump run (agent subprocess, pre-flight, lock wait, etc.), the process often stays alive. Stop fails and leaves the PID file:

```text
Sent SIGTERM to pid 43554 but it did not exit within 5s. PID file left at …
```

Operators resort to manual `kill -9`. Killing only the daemon pid often leaves agent subprocesses (e.g. `cursor-agent`) running as orphans.

## Goals

1. **`lumpcode stop --force`** — SIGKILL the daemon **and every process still in its descendant tree** (agents, git shells, etc.); remove PID and meta on success. **No pid collection during the run.**
2. **`lumpcode stop` (default)** — if the daemon is in a blocking run, **do not** send SIGTERM; print an **info** message telling the operator to pass `--force` or wait for the run to finish.
3. **Default stop when idle** — unchanged: SIGTERM, wait up to 5s, clean up PID/meta.

## Non-goals

- Recording subprocess pids in meta or core (`activeChildPid`, `execBinary` changes).
- Cooperative abort of in-flight work (no `AbortSignal`).
- Automatic SIGKILL after timeout on default stop.
- `--force` on `restart` in v1 (follow-up: pass through if needed).
- Detecting busy state from lock files or heuristics outside daemon meta.

## Proposed behavior

### Busy flag

Foreground daemon updates its **meta JSON** while blocking work is in progress:

```json
{ "cronSetup": "…", "workspaceStrategy": "worktree", "lumpName": "v0.0.9", "busy": true }
```

Set `busy: true` when a tick enters work that can block for a long time (start of `runTick` lump loop through `runLumpFromJsConfig` return). Set `busy: false` when that work finishes (success, failure, or skip). Omit `busy` or `false` when idle between ticks.

**Only `busy` is written** — no child pid fields.

### `lumpcode stop`

**Usage:** `lumpcode stop [options]`

| Option | Description |
| --- | --- |
| `--lumpName` | Existing — scope to per-lump daemon |
| `--force` | **New** — SIGKILL the daemon and all descendants |

**Without `--force`:**

1. Read PID + meta.
2. If `meta.busy === true` → **info** log (always printed, including with `--json`):

   ```text
   Daemon is running a lump (agent or other long work). Wait for it to finish, or run `lumpcode stop --force` to kill the process and its subprocesses.
   ```

   Exit non-zero; do not signal the process; leave PID/meta in place.

3. If not busy → SIGTERM, poll 5s, clean up on exit (today’s behavior).

**With `--force`:**

1. Skip busy check.
2. Resolve daemon pid from PID file.
3. **Kill process tree** (see below): all descendants deepest-first, then the daemon pid.
4. Poll until daemon pid is gone (deadline e.g. 5s).
5. Remove PID + meta on success.
6. Success message notes forced stop (and that subprocesses were targeted).

**Best effort:** agents that detach from the daemon tree (`setsid`, double-fork, etc.) may survive. Document in `DOCS/commands.md`.

### Process tree kill (no pre-collected pids)

New CLI util (e.g. `killProcessTree/`): discover descendants **at stop time** only.

**Unix (macOS, Linux):**

1. Snapshot process list once (or per recursion): `ps -ax -o pid=,ppid=` or repeated `pgrep -P <pid>`.
2. Build descendant set reachable from daemon pid via PPID links.
3. SIGKILL in **deepest-first** order (children before parents), then daemon pid.
4. Use `process.kill(pid, 'SIGKILL')` where possible; shell via `execAsync` only if needed for portability edge cases.

**Windows:**

- `taskkill /PID <daemonPid> /T /F` (tree kill in one call).

**Constraints:**

- Use `cwd` option with `execAsync`/`child_process`; no inline `cd &&` chains.
- Ignore `ESRCH` for pids that exited between snapshot and kill (race-safe).
- Do not kill unrelated processes — only pids in the descendant closure of the daemon pid.

### Docs

- `DOCS/commands.md` — document `--force`, tree kill, busy info message, best-effort caveat for detached agents.

## Technical approach

1. **`utils/killProcessTree/main.ts`** — platform branch: Unix recursive descendant discovery + SIGKILL; Windows `taskkill /T /F`. Unit-test with spawned parent/child fixture processes.
2. **`commands/stop/main.ts`** — add `--force` to schema; busy check; call `killProcessTree` on force path.
3. **`commands/start/main.ts`** — toggle `busy` in meta at tick run boundaries.
4. **`utils/readDaemonMeta`** — extend type with optional `busy?: boolean` only.
5. **Tests** — unit: stop refuses when `meta.busy`; `--force` kills daemon + child process in fixture tree; idle stop still SIGTERM-only. E2E optional: mock slow agent + `--force`.

## Acceptance criteria

- [ ] `stop` with `busy: true` in meta prints info message and does not kill the daemon.
- [ ] `stop --force` kills a busy daemon **and a direct child process** spawned by that daemon in a Vitest fixture (no manual pid tracking in meta).
- [ ] `stop --force` removes PID/meta after tree kill.
- [ ] `stop` when not busy still uses SIGTERM only and succeeds within 5s.
- [ ] Daemon sets/clears `busy` around lump runs in a tick; meta has no child pid fields.
- [ ] `DOCS/commands.md` updated with `--force` and best-effort wording.

## Design decisions

| Topic | Decision |
| --- | --- |
| Subprocess pids | **Zero collection** during run; discover descendants via `ps`/`pgrep` (Unix) or `taskkill /T` (Windows) at `--force` time only. |
| Kill order | Descendants deepest-first, then daemon (avoid orphans). |
| Meta fields | `busy` only — no `activeChildPid`. |
| Core / execBinary | No changes. |
| Guarantees | Best effort; detached agent internals may survive. |
