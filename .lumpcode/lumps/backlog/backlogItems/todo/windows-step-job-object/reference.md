# Reference: Windows step isolation

Background for `windows-step-job-object`. This is context, not requirements. The `req` stage decides the approach.

## Where this plugs in

PR #404 (`fix/agent-step-cgroup`) gives every step command a "box" so that whatever the step leaves behind can be killed. Windows is the only platform without one. Today it keeps `killProcessTree` (`taskkill /T /F`) on timeout and abort, and does nothing when a step ends normally.

| Piece | Path | What Windows needs |
| --- | --- | --- |
| Isolation choice | `packages/core/src/helpers/executeStepsForContextList/main.ts` | Pick a Windows kind instead of `processGroup` (ignored on win32 today) |
| Isolation type and kill on exit, timeout, abort | `packages/core/src/helpers/execBinary/main.ts` (`ExecBinaryIsolation`, `killIsolation`, `cleanUpLeftovers`) | A third kind, for example `{ kind: 'jobObject'; … }` |
| Live registry and exit hook | `packages/core/src/utils/liveStepIsolation/` | Track live jobs; kill them synchronously in `process.on('exit')` |
| Daemon meta | `packages/apps/cli/src/utils/readDaemonMeta/`, `daemonLiveMeta/` | Publish something another process can use to kill the job after the daemon dies |
| Leftovers after a daemon death or `stop --force` | `packages/apps/cli/src/utils/killDaemonLeftovers/` | Kill published jobs; it is a no-op on win32 today |
| Startup warning | `packages/apps/cli/src/utils/launchStartDaemon/runForeground.ts` | Stop warning on Windows once jobs work |

Memory: `.agents/memory/domain/engine-lifecycle.md` (step isolation) and `daemon.md` (`killDaemonLeftovers`).

## Windows mechanics

- A Job Object groups processes. Children of a process in a job join the job automatically unless the job allows breakaway and the child asks for it. `TerminateJobObject` kills every member; `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` kills them when the last handle to the job closes.
- Assign the step before it can start children: create it suspended (`CREATE_SUSPENDED`), `AssignProcessToJobObject`, then resume. Assigning after a normal spawn races with the step's first children.
- Nested jobs work on Windows 8 and later, so a step can be assigned even when Lumpcode itself already runs inside a job (CI runners, terminals).
- A job can have a name, and another process can open a named job (`OpenJobObject`) to terminate it. That is the natural thing to publish in the daemon meta, like `stepSystemdScopes` on Linux.
- Verify how libuv's own job object interacts with this: libuv assigns Node's children to a global job. Check that the step's grandchildren are not covered by it, so it doesn't already do part of the job.

## Implementation options to choose between

1. **Native Node addon** (N-API) that creates the job, spawns suspended, assigns, and resumes. Full control, but it adds a native build to `@lumpcode/core`, prebuilt binaries for x64 and arm64, and a story for the SEA builds (`.agents/memory/domain/distribution.md`).
2. **Small helper executable** shipped with the CLI (`lumpcode-job.exe <jobName> -- <command…>`) that creates a named job, starts the command inside it, relays stdio and the exit code, and exits. No addon, but one more binary to build, sign, and ship. Stdio relaying must keep today's `'exit'` and `'close'` behavior in `execBinary`.
3. **PowerShell wrapper** calling the Win32 API through `Add-Type`. No new binary, but slow to start on every step and fragile across PowerShell versions and execution policies.

## Constraints to keep

- `resolveSpawnExecutable` behavior on Windows: npm `.cmd` shims unwrap to `node <entry.js>`, and plain `.cmd` / `.bat` files go through `cmd.exe /d /s /c`. The box must contain whatever that produces.
- The failure shape and `reason` values of `execBinary` (`exit`, `timeout`, `aborted`, `spawn`) and the signal reporting stay the same.
- Do not regress Linux and macOS. Their isolation kinds and tests stay untouched.
- Acceptance mirrors #404: a step whose child leaves a background process behind (for example `start /b` of a long-running Node script) leaves nothing once the step returns, whether it succeeds, fails, or is aborted. The same holds after `lumpcode stop --force` and `stop --all --force`. These tests need a Windows CI job or runner. Today the platform-specific tests use `skipIf(process.platform === 'win32')`.
