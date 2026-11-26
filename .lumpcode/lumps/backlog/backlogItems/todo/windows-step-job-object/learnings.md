# Learnings

## Expected
`desc.yml` (`workflow: [req, impl]`, priority 32): on Windows, run each step command in its own Job Object and kill everything left in it when the step ends, fails, times out, or is aborted, and when the daemon is force-stopped or dies. Same moments as the Linux systemd scope and the macOS process group. A process group is the fallback and misses processes that leave the group. Background and constraints are in `reference.md` (where it plugs in, Windows job mechanics, three implementation options, `resolveSpawnExecutable`, unchanged `execBinary` reasons, no Linux/macOS regression).

This stage is `req`: write `requirements.md` only. Do not edit `desc.yml`. Do not implement. No testing-strategy section. This item has no `testPlan.md`, `expect.yml`, or parent requirements.

## Landed
Working tree only. The marker commit for this stage does not exist yet.

- `requirements.md`: decided plan. A checked-in win32-x64 `lumpcode-job.exe` in `@lumpcode/core` creates a named `Local\` job, assigns the step with `CREATE_SUSPENDED` before resume, and does not allow breakaway. `execBinary` grows `{ kind: 'jobObject', jobName }`. Daemon meta publishes `stepJobObjects`. `killDaemonLeftovers` kills those names on Windows. The startup warning is dropped when the probe succeeds. Failure reasons stay `exit`, `timeout`, `aborted`, and `spawn`.
- `learnings.md` (this file).

`desc.yml` and `reference.md` are unchanged.
