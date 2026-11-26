# Requirements: Windows step Job Object

| Field | Value |
| --- | --- |
| **Backlog** | `windows-step-job-object` · priority **32** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | None. Linux systemd scopes and macOS process groups already isolate step commands. |
| **Packages** | `@lumpcode/core` (primary: job helper, `execBinary`, live registry, step-walk choice) and `@lumpcode/cli` (daemon meta, leftover kill, startup warning, sidecar copy, one docs page). Recipes, cli-types, cli-utils, dashboard, and website packages stay unchanged. The website renders the CLI docs page. |

## Problem statement and motivation

On Linux, a step command runs in a systemd user scope. On macOS, it runs in its own process group. When the step ends, fails, times out, or is aborted, and when the daemon is force-stopped or dies, Lumpcode kills whatever that box still holds. Windows has no box. `executeStepsForContextList` asks for a process group, `execBinary` drops that request on `win32`, and `killProcessTree` (`taskkill /T /F`) runs only on timeout and abort. A step that returns normally leaves its children running. `killDaemonLeftovers` returns immediately on Windows, so `stop --force`, `stop --all --force`, and a daemon that dies (killed from outside, OOM) leave the same processes behind. The daemon warns at startup that leftovers are not cleaned up.

1. A background process started by a step (`start /b` of a long-running Node script, an agent that daemonizes a tool) survives a successful step, a non-zero step, and an abort.
2. `taskkill /T` walks the process tree. A process that has left the tree is invisible to it. A process group would miss the same processes, and Windows cannot kill a process group (`killProcessGroup` fails there).
3. libuv puts Node's direct children in a job that allows silent breakaway, so grandchildren are not kept in that job. It does not clean up when a step ends and Node stays up.
4. After `stop --force`, `stop --all --force`, or a dead daemon, nothing reads a Windows box out of daemon meta, because none is published.

## Goals

1. Each Windows step command runs in its own named job, assigned before that command can start children.
2. Every process still in the job is killed when the step ends, fails, times out, or is aborted, including processes that have left the process tree.
3. The same jobs are killed on the process exit hook, and after the daemon pid is dead, from the names the daemon published. That covers `stop --force`, `stop --all --force`, the supervisor's dead-daemon pass, and `orphanKillDaemon`.
4. `execBinary` failure shape stays `{ message, binaryPath, args, code?, signal?, stdout?, stderr?, reason? }` with `reason` of `exit`, `timeout`, `aborted`, or `spawn`.
5. Linux scopes and macOS process groups stay as they are.
6. When the job helper works, the Windows daemon does not warn. When it does not, steps still run and the warning names the probe failure.

## Non-goals

- Changing `systemdScope` or `processGroup` selection, kill grace, or unit names on Linux and macOS.
- A working process-group kill on Windows. `processGroup` stays ignored on `win32`.
- A native Node addon, `node-gyp`, or a PowerShell `Add-Type` wrapper.
- A second Windows architecture build. One win32-x64 `lumpcode-job.exe` is the helper. Windows on arm64 is outside the SEA matrix today (`detectPlatformArch` rejects it). If that OS cannot start the x64 helper, the probe fails and today's warning and leak behavior remain.
- Job memory, CPU, or priority limits.
- A graceful Windows signal or a `killGraceMs` wait before the job dies. `killProcessTree` on Windows already ignores grace and uses `taskkill /F`.
- Wrapping `execAsync`, git add/commit/push, or processes a step did not spawn.
- A new operator command, flag, or `lumpcode` subcommand. The helper executable is internal.
- Editing `.agents/memory` in this change.

## User stories / use cases

1. As an operator on a Windows worker — a step starts a background process and then returns, so that process is gone whether the step exits 0, exits non-zero, times out, or is aborted.
2. As an operator who runs `lumpcode stop --force` or `lumpcode stop --all --force` — processes that step jobs still hold are killed after the daemon pid is dead and before its meta file is removed.
3. As an operator whose daemon is killed from outside — the supervisor's dead-daemon pass and `orphanKillDaemon` kill those same published jobs.
4. As an operator who hits Ctrl+C a second time during `lumpcode run` — the process exit hook kills the live step jobs before the process finishes exiting.
5. As an operator on Linux or macOS — step isolation, startup warnings, and daemon meta fields for scopes and process groups behave as they do today.
6. As an operator on Windows whose job helper is missing or whose probe fails — the daemon logs one warning, steps still run, and leftover cleanup matches today's Windows behavior.

## Proposed behavior and UX

No new command, flag, or JSON envelope. Operators see two differences: leftover step processes are gone at the moments below, and the Windows daemon startup warning is gone when the probe succeeds.

### When a job is killed

| Moment | What happens |
| --- | --- |
| Step command exits, any code | The helper kills the job, then exits with that command's exit code. `execBinary` cleanup kills the job again. Already gone is success. |
| `timeoutMillis` or `AbortSignal` | `execBinary` kills the job, then `killProcessTree` on the helper pid if that pid is still alive. The failure `reason` is `timeout` or `aborted`. |
| `process` exit (second Ctrl+C, `process.exit`) | `killLiveStepIsolationSync` kills every tracked job name synchronously. |
| Daemon pid is dead, then `killDaemonLeftovers` | Each `stepJobObjects` name in meta is killed. Callers stay the supervisor dead-daemon pass, `orphanKillDaemon`, and the `--force` path of `stopOneDaemon` / `drainOrStopOneDaemon`. Kill runs after the pid is dead and before the meta file is unlinked. |
| Graceful `stop` / `stop --all` without `--force` | No extra job kill. SIGTERM aborts the runs; each step kills its job before the daemon exits. |

`killGraceMs` still applies to `systemdScope` and `processGroup`. A job kill does not wait.

### Startup warning

`runForeground` probes once. On Windows, when `detectJobObject()` is available, it prints no isolation warning. When the probe fails, the warning is:

```text
Windows step cleanup is not available (<reason>); processes that agent steps leave behind are not cleaned up on Windows.
```

`<reason>` is the probe's `reason` string. Linux and macOS keep the existing `systemd --user is not available` warning. `lumpcode run` stays quiet, as it does today.

### Isolation choice

`executeStepsForContextList` is the only chooser:

| Condition | `execBinary` `isolation` |
| --- | --- |
| `detectSystemdScope()` available | `{ kind: 'systemdScope', unitName }` (unchanged) |
| else `win32` and `detectJobObject()` available | `{ kind: 'jobObject', jobName }` from `jobObjectName` |
| else not `win32` | `{ kind: 'processGroup' }` (unchanged) |
| else Windows and the probe failed | omit `isolation` |

`execBinary` treats `processGroup` on `win32`, and `jobObject` on any other platform, as no isolation.

### `execBinary` contract

```ts
export type ExecBinaryIsolation =
  | { kind: 'systemdScope'; unitName: string }
  | { kind: 'processGroup' }
  | { kind: 'jobObject'; jobName: string };
```

Failure `reason` values stay `exit`, `timeout`, `aborted`, and `spawn`. `binaryPath` and `args` on the failure are the caller's, not the helper's. `signal` stays whatever Node reports for the helper process. On Windows that is usually absent. Timeout and abort still omit `signal`. A non-zero command exit is `reason: 'exit'` with `code` set to that exit code.

`resolveSpawnExecutable` runs before the helper starts. The job contains that resolved process: an npm or yarn `.cmd` shim is `node <entry.js>`, a plain `.cmd` or `.bat` is `cmd.exe /d /s /c`. The helper does not search `PATH` or wrap `.cmd` again.

For `jobObject`, `execBinary` spawns `lumpcode-job.exe` with `windowsHide: true`, `detached` unset, the caller's `cwd` and `env`, and the caller's stdio. Stderr must be a pipe (`executeStepsForContextList` already uses `stdio: ['inherit', 'pipe', 'pipe']`). If stderr is not a pipe, the call fails with `reason: 'spawn'` and does not start the command. Windows libuv passes only the three standard handles, so the helper does not get a fourth status fd.

The first line on the helper's stderr is a status line, written and flushed while the real command is still suspended. `execBinary` removes that line before `stdout` / `stderr` buffers, `onChunk`, and the failure preview.

| First stderr line | Result |
| --- | --- |
| `ok` | Command is running. `timeoutMillis` starts now, not on the helper's Node `spawn` event. Later stderr bytes are the command's. |
| `spawn <message>` | `reason: 'spawn'`, `message` is `<message>`, `code` omitted. |
| Helper exits with no newline | `reason: 'spawn'`. Message is the buffered text, or `job helper exited before it reported ready`. |

If the helper's Node spawn fails (helper missing), `reason` is `spawn` and the message is Node's. If `ok` has not arrived and `timeoutMillis` elapses from the helper's spawn, the result is `reason: 'timeout'`, and both the job name and the helper pid are killed.

On the command's exit, cleanup calls `killJobObject`. On timeout or abort, cleanup calls `killJobObject` and then `killProcessTree` on the helper pid when that pid is still alive. A failed job kill still falls through to `killProcessTree`, as a failed scope or process-group kill does today. Job cleanup failures go to `logger.warn`.

The helper's exit code is the command's exit code. `execBinary` settles on the helper's `'close'`, after the helper has killed leftovers, so a grandchild holding stdout does not hold `'close'` open.

### Job name and live registry

```ts
export type JobObjectSupport =
  | { available: true }
  | { available: false; reason: string };

export function detectJobObject(): Promise<JobObjectSupport>;

export function jobObjectName(input: {
  lumpName?: string;
  contextName: string;
  stepIndex: number | number[];
}): string;

export function killJobObject(input: {
  jobName: string;
}): Promise<Success<void> | Failure<string>>;

export function killJobObjectSync(input: { jobName: string }): void;
```

`jobObjectName` uses the same inputs and sanitizer as `systemdScopeUnitName` (`[^A-Za-z0-9_.:-]` becomes `_`, 6 hex chars of randomness). The kernel name is `Local\<sanitized prefix>`. The full name, including `Local\`, is at most 200 characters. `Local\` keeps the name in the caller's session, which is the session the daemon and the supervisor share. A random suffix keeps a leftover name from a crashed run from being reused.

`detectJobObject` is cached once per process. Off Windows it resolves `{ available: false, reason: 'job objects are not used on <platform>' }` and does not spawn. On Windows it runs `lumpcode-job.exe --probe` with a 10s timeout. Missing file: `reason` `lumpcode-job.exe was not found`. A non-zero probe: `reason` is the helper's stderr, or the exit detail when stderr is empty.

`killJobObject` runs `lumpcode-job.exe --kill <jobName>`. A missing job is success. Any other failure is `Failure` with `Could not kill job <jobName>: <detail>`. `killJobObjectSync` is the exit-hook form: `execFileSync`, 5000ms timeout, stdio ignored, errors swallowed.

```ts
export type LiveStepIsolation = {
  processGroups: number[];
  systemdScopes: string[];
  jobObjects: string[];
};

export type TrackedStepIsolation =
  | { kind: 'processGroup'; pgid: number }
  | { kind: 'systemdScope'; unitName: string }
  | { kind: 'jobObject'; jobName: string };
```

`jobObjects` is always present (empty when unused). `trackStepIsolation` records the job name when the helper process has spawned, and the returned untrack runs when cleanup finishes or the call settles. `listLiveStepIsolation` and `onLiveStepIsolationChange` include the new array. `killLiveStepIsolationSync` still SIGKILLs process groups and scopes, and also `killJobObjectSync` for each job name.

### Daemon meta

`DaemonMeta.stepJobObjects` is an optional `string[]` of non-empty names. Zod: `z.array(z.string().min(1)).optional()`. Older meta files that omit it still parse. `daemonLiveMeta` writes `stepJobObjects` from `live.jobObjects` when the array is non-empty, and omits the key when it is empty, same as `stepProcessGroups` and `stepSystemdScopes`. It is the only writer.

`killDaemonLeftovers` no longer returns immediately on Windows. Off Windows it keeps today's kill of `-daemonPid`, `stepProcessGroups`, and `stepSystemdScopes`. On Windows it does not call `process.kill(-pid)` and it ignores group and scope fields. It logs `killing step job <name> left by <label>` and calls `killJobObject` for each `stepJobObjects` entry. Failures are `logger.warn`. The function still returns `Promise<void>` and never fails the caller.

### Helper executable

Internal program, not a `lumpcode` command. One owner spawns it: `packages/core/src/utils/jobObject/`. CLI packaging only copies the file.

```text
lumpcode-job.exe --probe
lumpcode-job.exe --kill <jobName>
lumpcode-job.exe --job <jobName> -- <executable> <arg...>
```

`--` is required before the command. Arguments after `--` are the resolved argv, preserved as separate arguments, including spaces.

`--probe` creates a throwaway job, starts `cmd.exe /d /s /c exit 0` inside it the same way a step is started (suspended, assign, resume), waits, kills the job, and exits 0. The probe process is a child of the current Node process, so the assign happens nested under libuv's job. Non-zero exit means jobs are unavailable.

`--kill` opens the name, calls `TerminateJobObject` with exit code 1, and exits 0 when the job is already gone.

`--job` does the rest:

1. Create the named job. If the name already exists, close that handle without changing its limits, write `spawn job name already exists`, and exit 1.
2. Set `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` only. Do not set `JOB_OBJECT_LIMIT_BREAKAWAY_OK` or `JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK`.
3. `CreateProcess` the command with `CREATE_SUSPENDED`, Unicode environment, cwd and env inherited from the helper, and stdin/stdout/stderr inherited. The child does not inherit any other handle.
4. `AssignProcessToJobObject` on that suspended process. On failure, terminate the suspended process, write `spawn <message>`, exit 1. Do not resume an unassigned process.
5. Write `ok` to stderr and flush. Resume the primary thread. Close the helper's copies of stdin, stdout, and stderr so only the command and its descendants hold them.
6. Wait for that direct child. `TerminateJobObject` so descendants die and drop stdio. Exit with the child's exit code (`ExitProcess` of the full 32-bit code, not masked to 8 bits).

The helper process is not a member of the job. `TerminateJobObject` from outside kills the command tree and leaves the helper alive long enough to exit with the child's code. The helper holds the job handle until that kill, so a helper crash still closes the handle and `KILL_ON_JOB_CLOSE` kills members.

`start /b` of a long-running Node script from the step command must start inside the job and must die when the job is killed.

## Technical approach

The box is a named Windows job. A small C helper creates it and starts the step suspended, so Node's `child_process` still owns stdio, `'exit'`, and `'close'`. libuv's own job allows silent breakaway, so it does not contain the step's grandchildren. The step job does not allow breakaway, and the suspended process is assigned before it is resumed, which is what puts those grandchildren in the job. Nested jobs (Windows 8 and later) are what make the assign succeed while the helper is already inside libuv's job. The probe checks that assign.

`packages/core/src/utils/jobObject/` is the only module that resolves or spawns `lumpcode-job.exe`. `execBinary`, `liveStepIsolation`, and `killDaemonLeftovers` call `killJobObject` / `killJobObjectSync` / `detectJobObject`. They do not build helper argv themselves.

### Helper binary and lookup

| Piece | Path |
| --- | --- |
| C source | `packages/core/src/utils/jobObject/helper/` |
| Checked-in exe | `packages/core/vendor/win32-x64/lumpcode-job.exe` |
| Rebuild script | `packages/core/scripts/build-job-helper.mjs` (Windows, when the C source changes). `npm run build` stays rollup and does not compile it. |

`@lumpcode/core` `files` includes `vendor/win32-x64/lumpcode-job.exe`. The exe is not gitignored. A C change lands with a rebuilt exe so Linux publish and non-Windows installs still ship it.

`resolveJobHelperPath` lives in the jobObject util and is not a second copy elsewhere. First existing file wins:

1. When `node:sea` `isSea()` is true: `lumpcode-job.exe` beside `process.execPath`.
2. Walk ancestors of `import.meta.url` and return the first hit among `<dir>/lumpcode-job.exe`, `<dir>/vendor/lumpcode-job.exe`, and, when `<dir>/package.json` has `"name": "@lumpcode/core"`, `<dir>/vendor/win32-x64/lumpcode-job.exe`.

That covers core's own dist (library and unit runs), the CLI bundle (ancestor `vendor/lumpcode-job.exe`), and the SEA binary.

CLI copy is one function, `copyJobHelper({ pkgRoot, destDir })`, in `packages/apps/cli/scripts/`, next to the esbuild sidecar helper. It copies the core vendor exe to `destDir/lumpcode-job.exe`. Call it from:

- `scripts/build.js`, after the ncc bundle, into `packages/apps/cli/vendor`, so `node dist/index.js` resolves it.
- `scripts/native-binary.mjs`, into the same `vendor/` directory as `esbuild.exe`, so the installed SEA exe (`vendor/lumpcode.exe`) has the helper beside it.
- `scripts/build-sea.ps1`, into `bin/`, beside the Windows SEA exe. `build-sea.sh` does not require the Windows exe.

A missing source file makes `copyJobHelper` fail the Windows SEA build and the Windows native install. On other platforms the copy is skipped.

### Code map

| Step | Where | Contract |
| --- | --- | --- |
| 1 | `packages/core/src/utils/jobObject/` | Types and functions above. Barrel-export from `packages/core/src/utils/index.ts`. |
| 2 | `execBinary` | Third isolation kind, helper spawn, status line, timer start, cleanup, `trackStepIsolation({ kind: 'jobObject', jobName })`. |
| 3 | `liveStepIsolation` | `jobObjects` on the live snapshot and the sync exit kill. |
| 4 | `executeStepsForContextList` | Selection table above. `jobObjectName({ lumpName, contextName, stepIndex })` with the same `stepIndex` value the scope name uses. |
| 5 | `readDaemonMeta`, `daemonLiveMeta` | Optional `stepJobObjects`, omitted when empty. |
| 6 | `killDaemonLeftovers` | Windows kills published job names. Unix path unchanged. |
| 7 | `launchStartDaemon/runForeground.ts` | Windows warning only when the job probe fails. |
| 8 | CLI scripts | `copyJobHelper` at the three call sites above. |
| 9 | `packages/apps/cli/DOCS/reference/troubleshooting.md` | Windows bullet, below. |

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/cli/DOCS/reference/troubleshooting.md` | In `systemd --user is not available`, replace the Windows bullet. Say that each Windows step runs in its own job, that processes it starts are killed when the step ends, fails, times out, or is stopped, including processes that leave the process tree, and that the same cleanup runs after `stop --force`, `stop --all --force`, and a daemon that dies. The daemon warns at startup only when Windows step cleanup is unavailable. Leave the macOS and Linux bullets as they are. Do not name the helper executable, job-object APIs, or meta field. |

## Acceptance criteria

1. A Windows step whose command starts a background process with `start /b` (a long-running Node script) leaves that process dead after the step returns: exit 0, non-zero exit, timeout, and abort.
2. The same process is dead after `lumpcode stop --force` and `lumpcode stop --all --force`, and after the daemon pid is killed and `killDaemonLeftovers` runs, provided the job name was published in meta.
3. The process is in the job before it can create children. Descendants that leave the process tree and stay in the job die with the job. libuv's job is not the mechanism that kills them.
4. `execBinary` results still use `reason` `exit`, `timeout`, `aborted`, or `spawn`. A spawn failure of the step command (missing executable, assign failure, name collision) is `spawn`. A non-zero command exit is `exit` with that `code`. The status line is absent from `stdout`, `stderr`, and `onChunk`.
5. An npm `.cmd` shim still runs as `node <entry.js>` inside the job. A plain `.cmd` or `.bat` still runs as `cmd.exe /d /s /c` inside the job.
6. The Windows daemon logs no isolation warning when the probe succeeds, and logs the warning text above when the probe fails. On probe failure, steps still run and Windows does not kill a job.
7. Linux and macOS isolation kinds, startup warning, `stepProcessGroups`, and `stepSystemdScopes` are unchanged. `processGroup` on Windows still does not isolate.
8. Daemon meta gains optional `stepJobObjects`, omits it when empty, and still accepts meta written before this field existed. `killDaemonLeftovers` is the only leftover killer and, on Windows, kills those names.
9. Only `packages/core/src/utils/jobObject/` spawns `lumpcode-job.exe`. The checked-in win32-x64 exe is what the CLI bundle, the SEA layout, and `@lumpcode/core` ship. A second Ctrl+C still kills tracked jobs from the process exit hook.
