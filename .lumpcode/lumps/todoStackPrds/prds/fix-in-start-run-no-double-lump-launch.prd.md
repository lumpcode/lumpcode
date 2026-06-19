# PRD: Prevent double lump launch on the same branch workspace

| Field | Value |
| --- | --- |
| **Backlog** | `priority` / `small` |
| **Status** | Pending implementation |
| **Packages** | `packages/apps/cli` (primary); `packages/core` unchanged |

## Problem statement and motivation

Lumpcode runs agent and git work in a **branch workspace** — the absolute directory returned as `workspacePath` from `setupWorkspaceFn` (documented in user-facing prose as **branch workspace**; in CLI code this is often `branchWorkspacePath` in `makeLumpWorkspaceFns`).

| `workspaceStrategy` | Branch workspace path |
| --- | --- |
| `checkout` (default) | Same as **execution workspace** (`executionWorkspacePath`) for every lump in that project copy/checkout |
| `worktree` | `.lumpcode/worktrees/<branch-as-nested-dirs>/` under the execution workspace, one path per lump branch |

Two lump executions must not mutate the same branch workspace at the same time. Today they can overlap when:

1. **Overlapping daemon ticks** — `start` schedules ticks with Croner (`protect: true`) but invokes `void runTick()` without awaiting the async tick body. A long-running lump (slow agent, many contexts) can still be executing when the next tick starts, so two ticks can call `runLumpFromJsConfig` concurrently on the same paths.
2. **Manual `run` during an active daemon tick** — `lumpcode run <lumpName>` and the foreground/detached daemon are separate processes sharing the same execution workspace (especially in `checkout` mode and `shared` / `dedicated` mode on one machine).
3. **Multiple lumps per tick in `checkout` mode** — lumps run sequentially in one tick, so this is safe *within* a single tick; the risk is cross-tick or cross-process overlap, not the inner `for` loop.

Collisions corrupt git state (concurrent `git switch`, competing commits), race agent `cwd`, and produce nondeterministic failures that are hard to diagnose.

`maximumNumberOfConcurrentBranches` only limits **remote** open `lump/<lumpName>/*` branches; it does not serialize **in-process** or **on-disk** workspace use.

## Goals

1. **Serialize access per branch workspace path** — at most one active lump run may hold a given resolved absolute `branchWorkspacePath` at a time (within one machine / global config dir).
2. **Daemon (`start`) — wait, don’t collide** — when a tick would start a run whose branch workspace is busy, **log** that fact and **block until** the holder releases the lock, then proceed (resumable scheduler behavior).
3. **Manual `run` — fail fast** — when the branch workspace is busy, exit with a clear **failure** message telling the operator to wait (or stop the daemon), not hang.
4. **Cross-process correctness** — locking must work between daemon and CLI `run` (file-based lock under `globalConfigFolderPath`, not only an in-memory mutex).
5. **Observable behavior** — operators see explicit log lines in daemon output when waiting; `run` errors are actionable without reading source.

## Non-goals

- Parallel context execution within one lump (`parallel-context-exec` backlog) — this PRD **serializes** branch workspaces; parallel contexts stay out of scope.
- Changing cron overlap policy globally (e.g. replacing Croner) beyond what is required to **await** tick completion before considering the tick “done” for scheduling purposes.
- Distributed locking across machines (each host has its own execution workspace in `shared` mode; locks are per machine).
- Queuing multiple manual `run` commands — only fail-with-message for `run`.
- New CLI flags (`--force`, `--timeout`) unless added in a follow-up; v1 uses fixed wait-for-daemon / fail-for-run semantics.
- Core API changes (`runLump`, `executePromptsForContextList`) — coordination stays in the CLI layer around `runLumpFromJsConfig`.
- `plan` / `validate` / `lump-status` — no lock required for read-only preview commands in v1.

## User stories / use cases

1. **Operator (daemon, checkout mode)** — My agent sometimes runs 20+ minutes. The next cron tick must not run pre-flight and `git switch` on the same checkout while the previous lump is still executing; the daemon should log that it is waiting and resume when the workspace is free.
2. **Operator (manual run)** — I run `lumpcode run myLump` while the daemon is mid-tick on the same project. The CLI should refuse immediately with “branch workspace in use — wait or stop the daemon,” not corrupt the repo.
3. **Operator (worktree mode)** — Two different lumps use different worktree directories; they may run concurrently only if their **resolved branch workspace paths** differ. Two runs targeting the same worktree path must still serialize.
4. **Maintainer** — Integration tests can simulate overlap (slow mock command module + second tick or second `run`) and assert wait vs fail behavior without flakiness from real agents.

## Proposed behavior and UX

### Lock key

- **Key:** normalized absolute `branchWorkspacePath` (same string the engine uses as `workspacePath` after workspace setup).
- **Checkout:** `path.resolve(executionWorkspacePath)` — known before `runLump` without running git setup.
- **Worktree:** `lumpWorktreePath({ executionWorkspacePath, branchName })` where `branchName` comes from the same `branchFn` / context batching rules as today (`lumpBranchName` + `jsConfigToRunLumpInput` / `planLumpFromJsConfig` parity). Lock is taken **after** context list and branch name for the batch are known, **before** `runLump` mutates git or spawns the agent.

### Daemon — `lumpcode start`

Syntax unchanged:

```bash
lumpcode start [--foreground] [--cronSetup '<cron>'] [--lumpName <lumpName>] [--json]
```

**When starting a lump inside `runTick`:**

1. Resolve the branch workspace path for that lump run (checkout: execution workspace; worktree: compute branch name, then worktree path).
2. Try to acquire the lock (non-blocking attempt first).
3. If busy:
   - Emit one **info** line per wait episode, e.g.  
     `[lumpcode start] branch workspace busy at "<path>" (held by lump "<lumpName>" pid <pid>); waiting…`  
     (omit lump/pid in message if unknown; avoid spamming — optional heartbeat every N seconds is a follow-up).
4. **Wait** until the lock is released (poll with short sleep or blocking lock API), then acquire and run.
5. Release lock in a `finally` block after `runLumpFromJsConfig` completes (success, failure, or skipped).

**Tick scheduling:** Ensure a tick is not treated as finished until all awaited lump work (including waits) completes — i.e. the cron callback should **`await runTick()`**, not `void runTick()`. Keep Croner `protect: true` as a backstop.

### Manual run — `lumpcode run`

Syntax unchanged:

```bash
lumpcode run <lumpName> [--json]
```

**When starting the lump:**

1. Resolve branch workspace path (same rules as daemon).
2. If lock cannot be acquired immediately → return **failure** (non-zero exit) with a single clear message, e.g.  
   `Branch workspace "<path>" is in use by another lumpcode run (pid <pid>). Wait for it to finish or stop the daemon before running again.`  
3. Do **not** wait or retry in v1.

JSON output (`--json`): failure payload should include a stable machine-readable code (e.g. `branchWorkspaceBusy`) plus `branchWorkspacePath` and optional `holderPid` for scripting.

### Lock storage (implementation detail for implementers)

- Store lock files under `{globalConfigFolderPath}/branch-workspace-locks/` (name TBD; use a safe encoding of the absolute path, e.g. hash + optional human suffix).
- Lock file contents (JSON or plain text): `pid`, `lumpName`, `branchWorkspacePath`, `startedAt` (ISO), optional `projectName`.
- **Stale lock recovery:** if `pid` is not alive, treat lock as stale, log a warning, remove and acquire (covers crashed runs).
- Use atomic create (`wx` / exclusive open) or equivalent so two processes cannot both believe they hold the lock.

### Interaction with existing daemon rules

- `assertDaemonStartAllowed` still governs **how many daemons** run per project; this PRD governs **workspace collision** between daemon + `run` and overlapping ticks.
- Per-lump daemons with `worktree` may run in parallel **only** when branch workspace paths differ; checkout mode global daemon serializes all lumps on one execution workspace path.

## Technical approach

### Scope: `packages/apps/cli`

1. **New util** (one directory under `src/utils/`, barrel-exported), e.g. `branchWorkspaceLock/`:
   - `acquireBranchWorkspaceLock({ branchWorkspacePath, lumpName, mode: 'wait' | 'fail' })` → `Success<ReleaseFn>` | `Failure<string>`
   - `releaseBranchWorkspaceLock` via returned release function or explicit release
   - Helpers: `branchWorkspacePathForRun({ executionWorkspacePath, workspaceStrategy, branchName })` composing `makeLumpWorkspaceFns` / `lumpWorktreePath` rules
   - `resolveBranchWorkspacePathForLumpRun(...)` — shared by `run` and `start`, mirroring branch-name resolution used in `planLumpFromJsConfig` (load config → context list → `branchFn` / `lumpBranchName`)

2. **`runLumpFromJsConfig`** — wrap the existing `runLump(...)` call:
   - Accept optional `lockMode: 'wait' | 'fail'` (default `'fail'` for `run`, `'wait'` for daemon call sites).
   - Compute path → acquire → `try/finally` release.

3. **`commands/start/main.ts`**
   - Pass `lockMode: 'wait'` into `runLumpFromJsConfig`.
   - Change cron handler to `await runTick()` (or equivalent) so ticks don’t overlap in the same process.

4. **`commands/run/main.ts`**
   - Pass `lockMode: 'fail'` (or rely on default).

5. **Tests** (prefer integration-style with fixtures under `packages/apps/cli`):
   - Checkout: first run holds lock; second `run` fails with expected message.
   - Daemon wait: mock long `runLump` or sleep in test hook; second tick logs wait then proceeds after release.
   - Stale PID: dead pid in lock file → next acquire succeeds after warning.
   - Worktree: two branch names → two paths → concurrent acquire allowed (two parallel runs in test only if both can be mocked without real agents).

6. **Docs** (minimal user-facing):
   - `packages/apps/cli/DOCS/concepts.md` — short note under “When to use run vs start” that daemon waits on busy workspace; manual `run` fails if busy.
   - `packages/apps/cli/DOCS/commands.md` — `run` failure case; `start` tick behavior one line.
   - No migration guide; document current behavior only.

### Scope: `packages/core`

No changes. Workspace path semantics remain in `setupWorkspaceFn` return values; CLI enforces exclusivity before calling `runLump`.

### Out of scope packages

`packages/apps/gui`, `packages/apps/api`, `@lumpcode/cli-types` — no changes unless types are needed for a shared error code (unlikely in v1).

## Acceptance criteria

- [ ] Only one active holder per resolved absolute `branchWorkspacePath` on a given machine (cross-process verified by test).
- [ ] `lumpcode run <lumpName>` fails immediately with a clear message when the branch workspace lock is held; exit code non-zero.
- [ ] Daemon tick logs when it must wait for a busy branch workspace, then runs the lump after release without overlapping git/agent work on that path.
- [ ] Cron tick handler awaits completion of `runTick` (no fire-and-forget `void runTick()` for the main scheduling path).
- [ ] Lock is always released on success, failure, or skip from `runLumpFromJsConfig` (no permanent deadlock after normal completion).
- [ ] Stale lock (dead PID) is recovered automatically with a warning in logs.
- [ ] `checkout` strategy: concurrent runs for different lump names on the same execution workspace still serialize (same path).
- [ ] `worktree` strategy: runs with different computed worktree paths can proceed concurrently; same path still serializes.
- [ ] `packages/apps/cli` Vitest suite passes; new tests cover fail-wait and stale-lock cases.
- [ ] User docs (`concepts.md`, `commands.md`) mention busy-workspace behavior in plain language (no internal util names required).

## Open questions and risks

| Topic | Question / risk | Recommendation |
| --- | --- | --- |
| Lock file location | Under `~/.lumpcode/branch-workspace-locks/` vs under execution workspace `.lumpcode/` | Prefer **global** dir (same as daemons) so `shared` mode copy and source project don’t diverge; encode absolute path in filename hash. |
| Worktree path before contexts | Branch name depends on context batch; lock moment must match real run | Reuse `planLumpFromJsConfig` branch resolution; if context list load fails, fail before waiting. |
| Wait timeout | Daemon could wait forever if holder hangs | v1: no timeout (operator stops daemon). Follow-up: `--maxWait` or stale lock on missing heartbeat. |
| `skipped` runs | `tooManyOpenBranches` skips before heavy work | Still acquire lock only when about to call `runLump`, or skip lock if skipping early — prefer **no lock** if `runLump` is not invoked. |
| Multiple execution workspaces | Same project, different machines | Out of scope; each machine has independent locks. |
| Windows | File locking semantics | Use atomic create + PID check; add Windows integration test in CI matrix if feasible. |
| Log noise | Many lumps waiting on one checkout path | One log line per wait episode per lump; avoid per-poll logs. |
| `parallel-context-exec` | Future parallel contexts on one branch | Will require finer-grained locking or sub-path locks; document that this PRD is **per branch workspace**, not per context. |
| Dependency | No lock library in `package.json` today | Prefer Node `fs` atomic create + PID stale detection; avoid new dependency unless review demands `proper-lockfile`. |

## Related backlog

- `parallel-context-exec` — depends on clear workspace locking semantics from this task.
- `daemon-foreground-bootstrap` — orthogonal; same lock rules apply to foreground child.
- `graceful-error-handling` — may later unify JSON error codes (`branchWorkspaceBusy`).
