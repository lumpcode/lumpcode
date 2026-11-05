# Requirements: `stop --all` keeps going when a daemon is slow to exit

| Field | Value |
| --- | --- |
| **Backlog** | `stop-all-slow-exit-drain` · priority **20** · type **fix** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary: `@lumpcode/cli` (`utils/stopDaemon`, `commands/stop`, daemon E2E). `@lumpcode/core` unchanged. |

## Problem statement and motivation

An operator reported:

```text
$ lumpcode stop --all
Process pid 1997916 did not exit within 5s.
$ lumpcode stop --all
Stopped all Lumpcode daemons and the supervisor for "<project>".
```

And: when `stop --all` is waiting on a draining daemon and the operator aborts that wait (Ctrl+C), the lock does not seem to be released at the end.

Cause of the first defect, from the code:

1. `isDaemonMidRun` only looks at `inFlightRuns` / `inFlightLumpCount` / `busy`. A daemon inside a tick but not inside a lump run (discovery, git fetch, a workspace or git-common-dir lock wait of up to 15 min) reads as idle.
2. `drainOrStopOneDaemon` then sends SIGTERM and waits `DAEMON_IDLE_STOP_WAIT_MS` (5s). The daemon's shutdown handler (`installProcessShutdown` in `runForegroundStartDaemon`) only lets the process exit after the current `runTick()` returns, so the 5s wait times out.
3. `stopAllProjectDaemons` returns `failure(stopped.message)` on the first `failed` result. Daemons later in the loop are never signalled, the supervisor is never stopped, scheduler files are not unlinked, and the operator sees the raw `stopPid` text instead of the formatted single-daemon message.
4. The second run works because the first daemon has exited by then.

The second defect has no code-level cause yet. Lock files are keyed to the holder pid and reclaimed as stale by the next acquirer once that pid is dead (`acquireWorkspaceFileLock`), so a lock that stays means the daemon process is still alive after its drain. No test covers "daemon marked stopping mid-run, nobody waiting, run finishes, process exits".

## Goals

1. `stop --all` never stops early because one daemon missed the 5s SIGTERM wait. That daemon joins the shared drain wait.
2. Every daemon id is signalled or marked stopping, and the supervisor is stopped, in one `stop --all` call, unless the shared drain wait times out.
3. A SIGTERM timeout is a typed result, not a string match on the message.
4. A daemon draining with no `stop` process waiting exits after its run, removes its pid/meta/desired files, and leaves no lock file held by its pid.

## Non-goals

- Changing `isDaemonMidRun` or making tick phase count as mid-run.
- Changing single-daemon `lumpcode stop` (without `--all`). It still fails after 5s with the existing "Sent SIGTERM to pid N but it did not exit within 5s. PID file left at …" message (test ST8 stays as is).
- Changing `DAEMON_IDLE_STOP_WAIT_MS`, `DAEMON_FORCE_STOP_WAIT_MS`, or `STOP_ALL_DRAIN_TIMEOUT_MS`.
- Aborting an in-flight tick on SIGTERM faster (discovery, lock waits).
- `--all` behavior for non-timeout failures (pid file unreadable, signal refused). Those still return failure as today.
- Handling SIGINT inside the `stop` process itself.

## User stories / use cases

1. As an operator — I run `lumpcode stop --all` while a daemon is mid-discovery, so the command waits for it and stops everything, instead of failing and needing a second run.
2. As an operator — I Ctrl+C a `stop --all` that is waiting on a draining daemon, so the daemon still finishes its run, exits, and frees its locks.

## Proposed behavior and UX

### `StopPidResult` in `utils/stopDaemon`

The `failed` variant gains a required `cause`:

| `cause` | When |
| --- | --- |
| `pidRead` | `readDaemonPidIfAlive` failed |
| `signal` | SIGTERM or the force tree-kill could not be sent |
| `exitTimeout` | Signal sent, process still alive after `waitMs`. `pid` is set |

`stopPid` returns a failure that lets `signalWaitUnlink` set `cause: 'exitTimeout'` without inspecting the message. `stopOneDaemonCliFailure` picks its "did not exit within Ns. PID file left at …" copy from `cause === 'exitTimeout'` and drops the `message.includes('did not exit')` check. `reconcileDaemonConfigFiles` keeps treating every `failed` the same.

### `stop --all`

| Per-daemon result | Today | After |
| --- | --- | --- |
| `stopped`, `missing`, `stale` | continue | continue |
| `draining` | log, continue | unchanged |
| `failed` with `cause: 'exitTimeout'` | return failure | log `daemon "<id>" did not exit within 5s after SIGTERM; waiting for drain`, continue |
| `failed`, other cause | return failure | unchanged |

After the loop, the existing shared poll (`listRunningProjectDaemons` until empty, `STOP_ALL_DRAIN_TIMEOUT_MS`, or `DAEMON_FORCE_STOP_WAIT_MS` with `--force`) covers both draining and slow-exit daemons. On success: unlink scheduler files, stop the supervisor, print the existing success message.

Drain timeout message names what is still running:

```text
Timed out waiting for project daemons to exit (still running: "global", "nightly"). Run `lumpcode stop --all --force`.
```

### Drain exit with no waiter

A daemon whose `desired.json` is marked `stopping` while a lump run is in flight finishes that run, ends the tick, exits the process, and removes pid, meta, and desired files. Every workspace and git-common-dir lock acquired during the run is released before exit. This must hold whether or not a `stop` process is still polling.

## Technical approach

| Step | File | Change |
| --- | --- | --- |
| 1 | `packages/apps/cli/src/utils/stopDaemon/main.ts` | Add `cause` to `failed`. `stopPid` reports exit timeout distinctly. `stopOneDaemonCliFailure` switches on `cause` |
| 2 | `packages/apps/cli/src/commands/stop/stopAllProjectDaemons.ts` | `exitTimeout` joins the drain wait. Timeout message lists remaining daemon ids from the last `listRunningProjectDaemons` result |
| 3 | `packages/apps/cli/src/e2e/daemon-scenarios.test.ts` | Regression for the interrupted drain (below). If it fails, fix in the drain exit path of `runForegroundStartDaemon` (`utils/launchStartDaemon/runForeground.ts`) and the lock release of that run, not in `stop` |

Owner: the SIGTERM-timeout classification lives only in `utils/stopDaemon`. `commands/stop` reads `cause`; it does not parse messages.

## Testing strategy

| Level | What | Where |
| --- | --- | --- |
| Unit | `signalWaitUnlink` / `drainOrStopOneDaemon` against a SIGTERM-ignoring fixture returns `failed` with `cause: 'exitTimeout'` and `pid` | `utils/stopDaemon/unit.test.ts` |
| Unit | `stop --all` with two daemons, the first ignoring SIGTERM for ~7s then exiting: the second daemon is still stopped, the supervisor is stopped, the result succeeds, scheduler files are gone | `commands/stop/unit.test.ts` |
| Unit | `stop --all` with a daemon that never exits and a short injected `drainTimeoutMs`: failure message names that daemon id and suggests `--force` | `commands/stop/unit.test.ts` |
| Unit | Existing ST8 and "default stop still times out against a SIGTERM-ignoring process" stay green with unchanged copy | `commands/stop/unit.test.ts` |
| E2E | Start a daemon whose lump runs a slow command. Run `stop --all`, wait for the "waiting for drain" log, send SIGINT to the `stop` process. Poll: daemon pid exits, pid/meta/desired files are gone, no lock file under the workspace and git-common-dir lock dirs holds that pid | `e2e/daemon-scenarios.test.ts` |

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/cli/DOCS/reference/commands.md` (`lumpcode stop`) | One sentence: with `--all`, a daemon still running after the 5s SIGTERM wait, or mid-run, is waited for (up to 15 min) before the supervisor stops; `--force` skips the wait |

## Acceptance criteria

1. `stop --all` with one daemon that exits 6–10s after SIGTERM and one idle daemon succeeds in one call, stops both and the supervisor, and removes their scheduler files.
2. No `stop --all` output contains the bare `Process pid N did not exit within 5s.` text.
3. Single-daemon `stop` timeout copy is unchanged.
4. A drain timeout lists the daemon ids still running.
5. After a `stop --all` wait is interrupted, a draining daemon exits after its run and no lock file names its pid.
6. No code outside `utils/stopDaemon` decides that a stop failure was a timeout by reading the message.
