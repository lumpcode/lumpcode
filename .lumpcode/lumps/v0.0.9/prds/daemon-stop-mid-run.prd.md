# PRD: `stop --force` when daemon is mid-run

| Field | Value |
| --- | --- |
| **Backlog** | `daemon-stop-mid-run` · priority **2** · type **bugfix** |
| **Release goal** | [GOALS.md](../GOALS.md) — v0.0.9 |
| **Packages** | `packages/apps/cli` only |

## Problem

`lumpcode stop` sends SIGTERM and waits 5 seconds. When the daemon is blocked in a lump run (agent subprocess, pre-flight, lock wait), it often stays alive. Stop fails and leaves the PID file. Operators resort to manual `kill -9`, which can orphan agent subprocesses.

## Behavior

### Busy flag (daemon meta)

Foreground daemon toggles `busy` in its meta JSON around each lump run:

- Set `busy: true` immediately before `runLumpFromLumpName`, clear in `finally` when it returns.
- Omit `busy` or set `false` when idle between lumps/ticks.
- No child-pid fields in meta.

If the daemon crashes with `busy: true` left behind, `stop` trusts meta; use `stop --force` to recover.

### `lumpcode stop` (default)

1. Read PID + meta.
2. If `meta.busy === true`: exit **non-zero** with a clear message to wait or run `lumpcode stop --force`. With `--json`, include stable `code: "daemonBusy"`. Do **not** signal the process; leave PID/meta in place.
3. If not busy: SIGTERM, poll up to 5s, clean up PID/meta on exit (unchanged).

### `lumpcode stop --force`

1. Skip busy check.
2. Tree-kill the daemon pid and all descendants (discover at stop time; no pid collection during runs). Unix: descendant closure via process list, SIGKILL deepest-first. Windows: `taskkill /PID <pid> /T /F`.
3. Poll until daemon pid is gone (5s deadline), remove PID + meta on success.
4. Best-effort only — agents that detach from the tree may survive (document in `DOCS/commands.md`).

## Non-goals

- Subprocess pid tracking in meta or core changes.
- Cooperative abort (`AbortSignal`), auto-SIGKILL after default stop timeout, or `--force` on `restart` in v1.
- Inferring busy state from workspace lock files.

## Implementation

| Area | Change |
| --- | --- |
| `utils/killProcessTree/` | Platform tree kill (new util) |
| `commands/stop/main.ts` | `--force`, busy check, `daemonBusy` failure |
| `commands/start/main.ts` | Toggle `busy` around `runOneLump` |
| `utils/readDaemonMeta/` | Optional `busy?: boolean` |
| `DOCS/commands.md` | `--force`, busy refusal, best-effort caveat |

## Acceptance criteria

- [ ] `stop` with `busy: true` exits non-zero, message mentions `--force`, `--json` has `daemonBusy`; daemon untouched.
- [ ] `stop --force` kills daemon + child process in a Vitest fixture tree; removes PID/meta.
- [ ] `stop` when not busy still SIGTERM-only, succeeds within 5s.
- [ ] Daemon sets/clears `busy` per lump run; meta has no child pid fields.
- [ ] `DOCS/commands.md` updated.

## Tests

Unit only: busy refusal, idle SIGTERM stop, `killProcessTree` fixture with spawned parent/child. No E2E.
