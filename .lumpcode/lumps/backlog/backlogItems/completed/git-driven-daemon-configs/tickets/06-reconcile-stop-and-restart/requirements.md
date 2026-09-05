# Requirements: 06 stop file-launched daemons and hash-restart

Global contract: [`../../requirements.md`](../../requirements.md) (Apply ours/hash/disabled/noLongerConsidered; daemonBusy stay-due; remaining docs/e2e).

## Standalone value

The fleet follows git after start: disable or delete a recipe (or drop its `effectiveDiscoveryBranch` from expand) and the file-launched process stops; change include/cron (normalized) and it graceful-restarts.

## In scope

- Running + `daemonConfigFile` + same hash: no-op, no collision log.
- Running + `daemonConfigFile` + hash changed: graceful `stopOneDaemon` (not `--force`), then start new recipe. `daemonBusy` → stay due.
- Running + `daemonConfigFile` + `disabled` or no longer considered: graceful stop. `daemonBusy` → stay due.
- **noLongerConsidered**: deleted; `effectiveDiscoveryBranch` gone from expand; `discoveryBranch` mismatch; invalid file dropped; lost same-id contest.
- Never stop a process that lacks `daemonConfigFile`.
- Hash change into checkout + `maxParallelRun` set: graceful stop (same as any hash change); start pass refuses. File-launched process does not outlive an illegal considered file.
- Docs: hash-restart, disable/stop, collision-vs-ours. E2E: `--superviseOnly` + push recipe + `daemon-status` shows path; stop `--all` still stops supervise.

## Out of scope

- Force-kill. Re-read local.json each pass. Shared file reconcile. `refreshCommand` in supervise.

## Acceptance

- [ ] Normalized hash change restarts; JSON/YAML/key-order/empty-include do not.
- [ ] File-launched + disabled or no longer considered → graceful stop; CLI-started never stopped for these reasons.
- [ ] `daemonBusy` on stop/restart retries next 30s until success, then 5 min.
