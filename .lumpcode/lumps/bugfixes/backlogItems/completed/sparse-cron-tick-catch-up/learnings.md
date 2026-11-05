# Learnings

## Expected
`desc.yml`: a daemon on a sparse cron loses that day's run when the scheduled fire lands while a tick is still running, during the immediate first tick, or when a lump times out waiting on a workspace lock. Run one catch-up tick after a skipped fire, and retry lock-timed-out lump lines until the next scheduled fire. Workflow is `impl` only. No `dependsOn`.

`requirements.md`: one tick body runs at a time. A fire during any tick, including the first, becomes one `missedFire` full tick as soon as the running tick ends. Several skipped fires coalesce into that one catch-up. A line is owed only for `workspacePathBusy` with `reason: 'waitTimedOut'`, and only that line is retried after 60s while the next cron fire is farther away than 60s. Owed lines are dropped when the next fire is within 60s. Other failures are not retried. `desired.json` `stopping` starts no catch-up and clears a pending retry. `nextTickAt` is the earlier of a pending lock retry and the cron's next run. Invalid `cronSetup` still fails with `Failed to start scheduler for "<cronSetup>": <msg>`. Scheduling lives only in `utils/daemonTickScheduler`. Docs: one note on `lumpcode start`, one under different schedules per lump.

This item has no `testPlan.md` or `expect.yml`.

## Landed
Working tree only. No marker commit yet.

- `packages/apps/cli/src/utils/daemonTickScheduler/main.ts` and `index.ts` own trigger selection, the single-tick guard, missed-fire coalescing, the 60s lock retry, and the Cron lifecycle. `CATCH_UP_RETRY_DELAY_MS` is `60_000`.
- `packages/apps/cli/src/utils/daemonTickScheduler/unit.test.ts` covers coalesced missed fires, a fire during the initial tick, lock-retry repeat and drop, `shouldStop`, `stop()` clearing the timer, `nextTickAt`, and invalid cron.
- `packages/apps/cli/src/utils/runLumpFromJsConfig/failures.ts` adds `isRunLumpLockWaitTimeoutFailure`, re-exported from `main.ts`. `failures.unit.test.ts` checks `waitTimedOut`, fail-mode busy, and `kind: 'message'`.
- `packages/apps/cli/src/utils/launchStartDaemon/runForeground.ts` delegates scheduling to that util. Catch-up ticks log `(catch-up: missed fire)` or `(catch-up: lock retry)`. A lock retry runs only the owed lines. The file no longer constructs a Cron, a retry timer, or its own in-flight flag.
- `packages/apps/cli/src/utils/index.ts` barrel-exports the scheduler.
- `packages/apps/cli/src/commands/start/testing/sparseCronCatchUp.unit.test.ts` retries one wait timeout through the foreground daemon, does not retry a message failure, and logs a missed-fire catch-up when the fire lands in the first tick.
- `packages/apps/cli/DOCS/reference/commands.md` and `packages/apps/cli/DOCS/examples/building-blocks.md` describe same-day catch-up.
- `learnings.md` (this file).

`npm run build -w=@lumpcode/cli` and `npm run test -w=@lumpcode/cli` passed (1239 tests).
