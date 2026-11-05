# Learnings

## Expected
`desc.yml`: `lumpcode stop --all` must not abort with the bare "Process pid N did not exit within 5s." when one daemon is slow to exit after SIGTERM. That daemon is draining, so `--all` keeps going. A draining daemon still exits and frees its locks after the stop wait is interrupted.

`requirements.md`: `failed` gains a required `cause` (`pidRead`, `signal`, `exitTimeout`). `stopPid` reports an exit timeout so callers do not read the message. `stopOneDaemonCliFailure` uses `cause === 'exitTimeout'` and keeps the single-daemon timeout copy. `stop --all` logs an exit timeout and continues into the shared drain wait. Other failures still return. A drain timeout names the daemon ids still running and suggests `--force`. A daemon whose `desired.json` is `stopping` finishes its run, exits, removes pid/meta/desired, and releases workspace and git-common-dir locks even when no `stop` process is still polling. Do not change `isDaemonMidRun`, single-daemon `stop`, the wait constants, or SIGINT handling inside `stop`. One sentence on `lumpcode stop` in `DOCS/reference/commands.md`. Unit coverage in `utils/stopDaemon` and `commands/stop`; the interrupted-drain case in `e2e/daemon-scenarios.test.ts`. This item has no `testPlan.md` or `expect.yml`.

## Landed
Working tree only. No marker commit yet.

- `packages/apps/cli/src/utils/stopDaemon/main.ts` adds `cause` on `failed`. `stopPid` returns `signal` or `exitTimeout`. The single-daemon timeout copy is chosen from `cause`.
- `packages/apps/cli/src/commands/stop/stopAllProjectDaemons.ts` continues on `exitTimeout` and names the daemon ids still running when the shared drain times out.
- `packages/apps/cli/src/utils/stopDaemon/unit.test.ts` expects `exitTimeout` and `pid` from a SIGTERM-ignoring process.
- `packages/apps/cli/src/commands/stop/unit.test.ts` covers a daemon that exits about 7s after SIGTERM: the other daemon and the supervisor still stop, and scheduler files are removed. A short `drainTimeoutMs` names the daemon still running. ST8 and the idle SIGTERM-ignore copy are unchanged.
- `packages/apps/cli/src/e2e/daemon-scenarios.test.ts` starts a daemon whose lump runs a slow command, waits for the drain log, and sends SIGINT to the `stop` process group (the launcher does not forward SIGINT to the CLI child). The daemon pid exits, pid/meta/desired are gone, and no workspace or git-common-dir lock holds that pid.
- `packages/apps/cli/DOCS/reference/commands.md` says `--all` waits up to 15 min for a mid-run daemon or one still running after the 5s SIGTERM wait, and that `--force` skips the wait.
- `learnings.md` (this file).

`runForegroundStartDaemon` is unchanged. The interrupted-drain e2e passed against the existing exit path.

`npm run test -w=@lumpcode/cli` passed (1214 tests). The new daemon e2e scenario passed with the node runner.
