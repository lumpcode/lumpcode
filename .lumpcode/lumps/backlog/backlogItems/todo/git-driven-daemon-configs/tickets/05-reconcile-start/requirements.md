# Requirements: 05 supervise starts considered enabled file daemons

Global contract: [`../../requirements.md`](../../requirements.md) (Supervise timing; Apply start/collision rows; freeze at supervise start; shared skip).

## Standalone value

Push an enabled recipe to an expanded primary, wait for a successful reconcile: that `daemonId` is running with `daemonConfigFile` in meta. Git-driven **start** works. Stop and hash-restart are ticket 06.

## In scope

- Consts: `SUPERVISE_DAEMON_CONFIG_RECONCILE_INTERVAL_MS`, `DAEMON_CONFIG_RECONCILE_LOCK_HOLDER`.
- Util `reconcileDaemonConfigFiles` (or equivalent) + wire into `supervise` after 30s keep-alive:
  - `nextDueAt = 0` at supervise start; retry every 30s while due; success → +5 min.
  - `gitCommonDirLock` `fail`; busy → stay due.
  - Fetch `--prune --no-write-fetch-head origin`; then `discoverDaemonConfigFiles`; **release lock before spawn**.
  - Fetch/discover failure → stay due. Snapshot taken then CLI id collision → **do not** stay due.
- Dedicated only. Shared: skip file reconcile. Supervise-start snapshot `disabled === true`: skip file reconcile.
- One merged config read at supervise start; pass into `launchStartDaemon`.
- Apply: not running + enabled winner → `launchStartDaemon` with `daemonConfigFile` meta.
- Not running + missing/`disabled`: no-op.
- Running, **no** `daemonConfigFile`, considered file wants that id: log, skip.
- Checkout + file `maxParallelRun` set: do not start, log.
- Docs: concepts section for repo files (start/collision/bootstrap/`discoveryBranch`). `get-started` optional dedicated push. Link from `commands.md`.

Ticket 01 is recommended for operators but is not a `dependsOn`.

## Out of scope

- Graceful stop of file-launched daemons (`disabled`, deleted, branch gone, lost contest).
- Hash-restart; `daemonBusy` stay-due for stop/restart.
- Changing `spawnDesiredDaemon` (ticket 02).

## Acceptance

- [ ] Dedicated: considered enabled file on any expanded `origin/<scan>` starts that daemon; not on cwd/`HEAD`.
- [ ] Shared supervise does not start from files.
- [ ] CLI-owned id: log, skip; lock busy stays due; 30s keep-alive still runs.
- [ ] `disabled: true` file is not started (running leftover is ticket 06).
