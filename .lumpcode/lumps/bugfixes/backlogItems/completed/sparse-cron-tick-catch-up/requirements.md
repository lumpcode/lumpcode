# Requirements: sparse-cron daemons catch up on missed and lock-timed-out ticks

| Field | Value |
| --- | --- |
| **Backlog** | `sparse-cron-tick-catch-up` · priority **22** · type **fix** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary: `@lumpcode/cli` (`utils/launchStartDaemon/runForeground.ts`, new `utils/daemonTickScheduler/`, `utils/runLumpFromJsConfig/failures.ts`). `@lumpcode/core` unchanged. |

## Problem statement and motivation

The documented pattern for different schedules is a sparse daemon (`--include=<lump> --cronSetup '0 7 * * *'`, or a `.lumpcode/daemons/<id>.json` with `cronSetup`) next to a frequent daemon that excludes that lump. A sparse daemon can lose a whole day of work with no log line saying so. The default `*/5 * * * *` heals in minutes; a daily cron does not heal until tomorrow.

Repro, from `runForegroundStartDaemon` in `packages/apps/cli/src/utils/launchStartDaemon/runForeground.ts`:

1. **Fire during a running tick.** The scheduler is `new Cron(cronSetup, { protect: true }, runTick)`. A fire while the previous `runTick` is still running is dropped by Croner, and Croner never replays dropped fires. Start a daily daemon whose tick takes longer than until the next fire (or a previous day's run still in flight at 07:00): the 07:00 run is gone.
2. **Fire during the immediate first tick.** The first `runTick()` runs before the `Cron` is constructed. Start a daily `0 7 * * *` daemon at 06:58 with a first tick that runs until 07:20: the `Cron` is built at 07:20, its next run is tomorrow, and today's 07:00 fire never existed.
3. **Lock-wait timeout.** Daemon runs use `lockMode: 'wait'` with `WORKSPACE_LOCK_WAIT_TIMEOUT_MS` (15 min). On `checkout`, another lump holds the execution-workspace lock for its whole agent run, which routinely exceeds 15 min. `runLumpFromLumpName` then returns `{ kind: 'workspacePathBusy', reason: 'waitTimedOut' }`, the tick logs an error, and nothing retries until the next fire.

## Goals

1. A scheduled fire that arrives while any tick is running (including the first one) is never lost: one catch-up tick runs as soon as the running tick ends.
2. A lump line that failed only because a workspace path-lock wait timed out is retried inside the same due window (before the next scheduled fire).
3. Every catch-up is bounded: no unbounded lock wait, no overlapping ticks, no retry after the next scheduled fire is close, nothing after drain starts.
4. Catch-ups are visible in the daemon log and in `nextTickAt`.

## Non-goals

- Persisting "due and not yet succeeded" across daemon restarts. A restart still runs the immediate first tick, which covers it.
- Replaying more than one tick for many skipped fires. Several skipped fires coalesce into one catch-up.
- Retrying any failure other than a path-lock wait timeout. Agent failures, git failures, `gitCommonDirBusy` timeouts (they surface as `kind: 'message'` today), discovery failures, and `tooManyOpenBranches` skips are not retried.
- Making `maxParallelRun` a machine-wide cap, or changing it in any way.
- Changing `WORKSPACE_LOCK_WAIT_TIMEOUT_MS`, `DEFAULT_DAEMON_CRON_SETUP`, or the default `workspaceStrategy`.
- Changing shared-mode or manual `run` behavior. This is daemon scheduling only.
- New CLI flags, `local.json` fields, or daemon-file fields.

## User stories / use cases

1. As an operator with a daily triage daemon on a busy worker — when 07:00 lands during a long tick, triage still runs right after that tick, so I do not lose a day.
2. As an operator who just started a daily daemon a few minutes before its fire time — the fire is not swallowed by the first tick.
3. As an operator on `checkout` with two daemons — when my daily lump times out waiting for the other lump's agent run, it tries again every minute until it gets the lock or the next day's fire is close.
4. As an operator reading `daemon-log` — I can see that a fire was skipped and that a catch-up ran.

## Proposed behavior and UX

### Tick triggers

Every tick has a trigger. Only one tick body runs at a time in one daemon process, whatever the trigger.

| Trigger | When | What runs |
| --- | --- | --- |
| `initial` | Daemon start | Full tick (collect + run), as today |
| `scheduled` | Cron fire while no tick is running | Full tick, as today |
| `missedFire` | A tick just ended and at least one cron fire arrived while it ran | One full tick, immediately |
| `lockRetry` | A tick just ended with owed lump lines and no missed fire | Only the owed lump lines, after `CATCH_UP_RETRY_DELAY_MS` |

Rules applied after any tick ends, in order:

1. If `desired.json` is `stopping` (existing `shouldDrainDaemon`), no catch-up runs and any pending retry timer is cleared.
2. If a fire was missed, clear the missed flag and the owed lines, then run a `missedFire` tick now. A full tick re-collects every line, so owed lines are covered.
3. Else if lines are owed and the next scheduled fire is more than `CATCH_UP_RETRY_DELAY_MS` away, schedule a `lockRetry` tick for those lines after the delay.
4. Else (owed lines, next fire within the delay) drop the owed lines. The scheduled tick will collect them.

A fire that arrives during a `missedFire` or `lockRetry` tick is itself recorded as missed, so the same rules apply again. Retries repeat until the line stops timing out or rule 4 applies. Each attempt is still bounded by the existing 15 min lock wait.

`CATCH_UP_RETRY_DELAY_MS` is `60_000`, exported from `utils/daemonTickScheduler`. Not configurable.

These rules apply to every daemon, not only sparse crons. On the default `*/5 * * * *`, a `missedFire` tick runs the next tick a few minutes early, and rule 4 usually drops owed lines because the next fire is close.

### Owed lump line

A lump line is owed when its `runLumpFromLumpName` result is a failure with `kind: 'workspacePathBusy'` and `reason: 'waitTimedOut'`. Identity is the existing `LumpLine` (`lumpName` + optional `effectiveDiscoveryBranch`); the same line is owed at most once per tick.

`lockRetry` runs those `LumpLine`s through the existing `runLumpLine` and `runLumpLinesWithConcurrency` (same `effectiveConcurrency`). It does not re-run discovery, include/exclude, scoring, or reorder. The lump run itself still re-discovers todos, the open-branch cap, and `disabled`, as any run does.

### Logs (info level, daemon log)

```text
scheduled fire at <iso> skipped while a tick is running; catch-up queued
tick <n> (catch-up: missed fire) — running <k> lump(s)… [<labels>]
lump "<name>": workspace lock wait timed out; retry in 60s
tick <n> (catch-up: lock retry) — running <k> lump(s)… [<labels>]
lump "<name>": workspace lock wait timed out; next scheduled fire at <iso> is within 60s, not retrying
```

The existing `lump "<name>": <message>` error line for the timeout stays. Catch-up ticks increment the same `ticks` counter.

### Live meta

`nextTickAt` is the earlier of a pending `lockRetry` time and the cron's next run. A `missedFire` tick starts immediately, so it does not change `nextTickAt`. `tickPhase` is `running` during catch-up ticks, as during any tick. No new meta fields.

### `utils/daemonTickScheduler` (new, canonical owner)

Owns trigger selection, the single-tick guard, missed-fire coalescing, owed-line retry timing, and the `Cron` lifecycle. Signature sketch (field names binding, container types free):

```ts
type TickTrigger = 'initial' | 'scheduled' | 'missedFire' | 'lockRetry';

createDaemonTickScheduler(input: {
    cronSetup: string;
    name: string;
    logger: Logger;
    runTick: (input: { trigger: TickTrigger; onlyLines?: LumpLine[] }) => Promise<{ owedLines: LumpLine[] }>;
    shouldStop: () => Promise<boolean>;
    onNextTickAtChange: (iso: string | undefined) => Promise<void>;
}) → Success<{ start(): Promise<void>; stop(): void }> | Failure<string>
```

- `Failure` when `cronSetup` does not parse, with the existing `Failed to start scheduler for "<cronSetup>": <msg>` text, so the start command's failure copy does not change.
- The `Cron` is constructed before `start()` runs the `initial` tick, so fires during the first tick are recorded.
- Missed fires are recorded both from the `Cron` callback when the guard is busy and from Croner's `protect` callback. No other code decides whether a fire was missed.
- `stop()` stops the `Cron` and clears any pending retry timer.
- A test-only seam to drive fires and time without real cron waits is allowed (for example an injectable cron factory and clock). It is not used by production callers.

`runForegroundStartDaemon` keeps owning what a tick does (log retention, collect, run, live meta phase, drain check) and delegates only scheduling to the util. `runLumpLine` reports whether the line is owed; classification uses a new `isRunLumpLockWaitTimeoutFailure(failure)` predicate in `utils/runLumpFromJsConfig/failures.ts`, next to `isRunLumpWorkspacePathBusyFailure`.

## Technical approach

| Step | File | Change |
| --- | --- | --- |
| 1 | `packages/apps/cli/src/utils/runLumpFromJsConfig/failures.ts` | Add `isRunLumpLockWaitTimeoutFailure`: `kind: 'workspacePathBusy'` and `reason: 'waitTimedOut'` |
| 2 | `packages/apps/cli/src/utils/daemonTickScheduler/` (`main.ts`, `index.ts`, `unit.test.ts`) | New util as above; export `CATCH_UP_RETRY_DELAY_MS`. Add to the utils barrel |
| 3 | `packages/apps/cli/src/utils/launchStartDaemon/runForeground.ts` | `runTick` takes `{ trigger, onlyLines? }`, returns `{ owedLines }`. With `onlyLines`, skip collect and run those lines. `runLumpLine` returns whether the line is owed and logs the retry line. Replace the inline first `runTick()` + `new Cron(...)` + `nextTickAtIso` updates with the scheduler; keep the invalid-cron cleanup (`removeOwnPidArtifacts`) on scheduler `Failure`. Tick log line adds the `(catch-up: …)` suffix for catch-up triggers |
| 4 | `packages/apps/cli/DOCS/` | Rows below |

Ownership: only `daemonTickScheduler` decides when a tick runs and whether a fire was missed. Only `isRunLumpLockWaitTimeoutFailure` decides whether a run result is owed. `runForeground.ts` does not keep its own `Cron`, timer, or in-flight flag.

## Testing strategy

| Level | What | Where |
| --- | --- | --- |
| Unit | Fire while a tick runs → exactly one `missedFire` tick after it ends; three fires during one tick still give one catch-up | `utils/daemonTickScheduler/unit.test.ts` |
| Unit | Fire during the `initial` tick → one `missedFire` tick | same |
| Unit | Owed lines with next fire far away → `lockRetry` after `CATCH_UP_RETRY_DELAY_MS` with exactly those lines; repeats while still owed; stops once owed is empty | same |
| Unit | Owed lines with next fire within the delay → no retry, owed dropped | same |
| Unit | Missed fire and owed lines together → one `missedFire` full tick, no `lockRetry` | same |
| Unit | `shouldStop` true after a tick → no catch-up; `stop()` clears a pending retry timer | same |
| Unit | `nextTickAt` reports the pending retry time when it is earlier than the cron's next run | same |
| Unit | Invalid `cronSetup` → `Failure` with the existing message | same |
| Unit | `isRunLumpLockWaitTimeoutFailure` true only for `workspacePathBusy` + `waitTimedOut`; false for `workspacePathBusy` without reason (fail mode) and for `kind: 'message'` | `utils/runLumpFromJsConfig/failures.unit.test.ts` (new) |
| Integration | Foreground start (spy on `runLumpFromLumpName`, as in `daemonInFlightMeta.unit.test.ts`) returning a `waitTimedOut` failure once then success, with a cron whose next run is far away and the scheduler's test seam advancing time: the lump is called twice and the log shows the lock-retry line | `commands/start/testing/sparseCronCatchUp.unit.test.ts` (new) |
| Integration | Same setup, runLumpFromLumpName returns a non-timeout failure: called once, no retry | same |
| Existing | `general.unit.test.ts` invalid cron (`%%%`) and every `runForegroundStart`-style test stay green with unchanged messages | `commands/start/testing/*` |

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/cli/DOCS/reference/commands.md` (`lumpcode start`) | One sentence: a cron fire that lands while a tick is running is not dropped; one catch-up tick runs when that tick ends. A lump that times out waiting on a workspace lock is retried every minute until the next scheduled fire |
| `packages/apps/cli/DOCS/examples/building-blocks.md` (Different schedules per lump) | One sentence: a daily daemon that is busy or blocked at its fire time catches up the same day; it does not wait for tomorrow |

## Acceptance criteria

1. A daily daemon whose fire lands during a running tick runs one catch-up tick right after that tick, and the log says so.
2. A daily daemon started shortly before its fire time, whose first tick runs past that time, runs a catch-up tick after the first tick.
3. A lump line that fails with a workspace lock wait timeout is retried after 60s, only that line, until it no longer times out or the next fire is within 60s.
4. No two ticks ever overlap in one daemon process, including catch-ups.
5. No catch-up starts after `desired.json` is `stopping`, and stopping clears a pending retry.
6. Non-timeout failures are not retried.
7. Invalid `cronSetup` fails start with the same message as today.
8. `runForeground.ts` contains no `Cron` construction, retry timer, or tick in-flight flag of its own; those live only in `utils/daemonTickScheduler`.
