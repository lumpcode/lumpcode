# PRD: Execution workspace lock during pre-flight and branch setup

| Field | Value |
| --- | --- |
| **Backlog** | `execution-workspace-setup-lock` · priority **1** · type **feature** |
| **Release goal** | [GOALS.md](../GOALS.md) — v0.0.9 (safe parallel worktree daemons) |
| **Depends on** | Branch workspace lock (shipped); per-lump `resolvedBaseBranch` from [multi-project-base-branches](./multi-project-base-branches.prd.md) for `targetBranch` |
| **Packages** | `packages/apps/cli` (primary); `packages/core` (minimal hook) |
| **Related** | [fix-in-start-run-no-double-lump-launch](../../todoStackPrds/prds/fix-in-start-run-no-double-lump-launch.prd.md) (branch workspace lock — **complementary**, already implemented); [dedicated-dirty-env-guardrail](../../todoStackPrds/prds/dedicated-dirty-env-guardrail.prd.md) (orthogonal) |

## Problem statement and motivation

In **dedicated mode**, the project workspace and execution workspace are the same checkout. Before a lump runs, the CLI mutates that checkout in ways that are **not** covered by today's **branch workspace lock** (`branchWorkspaceLock/`, held in `runLumpFromJsConfig` around `runLump`):

1. **Pre-flight** (`runPreflight` → `pullProjectBaseBranch`): `git fetch`, `git switch`, `git reset --hard`, `git pull` on the execution workspace.
2. **Workspace setup** (`setupWorkspaceFn`, worktree mode): `git switch` on the main worktree, `git worktree add`, etc., still executed against the execution workspace.

The branch workspace lock keys off the **branch workspace path** (worktree directory). In worktree mode that path **differs** from the execution workspace path, so two `lumpcode start --lumpName` daemons can concurrently:

- reset/switch the **same** main checkout (pre-flight), and
- run overlapping `git switch` / `git worktree add` during setup,

while each holds a **different** branch-workspace lock. Agent work later runs in separate worktrees, but the shared main checkout is already corrupted.

**User-visible scenario:** `workspaceStrategy: worktree`, **dedicated mode**, `lumpcode start --lumpName A` and `lumpcode start --lumpName B` at the same time. Each lump needs pre-flight + setup from the **same checkout** (project workspace = execution workspace) before it can run in its own worktree. Nothing serializes that setup phase today.

This problem is **dedicated-mode only**. In dedicated mode, pre-flight and worktree setup mutate the operator's checkout — the same tree two parallel lump runs use for git setup. In **shared mode**, git setup runs on the project **copy** under `~/.lumpcode/project-copies/`; the source project workspace is not used for those mutations, so this race does not apply there. This PRD does **not** depend on multi–discovery-branch scheduling rules.

## Goals

1. **Serialize execution-workspace git mutations** for the "prepare this lump's branch workspace" phase: from the start of that lump's pre-flight through successful completion of `setupWorkspaceFn` (including execution of its shell command).
2. **Cross-process correctness** — file-based lock under `globalConfigFolderPath`, same family as `branch-workspace-locks/`.
3. **Same wait/fail policy as branch workspace lock** — daemon (`start`): `wait`; manual `run`: `fail` fast.
4. **Per-lump pre-flight inside the lock** — pre-flight for a lump run must run **while holding** the execution workspace lock, with `targetBranch` set to that lump's **`resolvedBaseBranch`** (`lump.baseBranch ?? lump.discoveryBranch ?? primaryDiscoveryBranch ?? project.json projectBaseBranch` via `resolveLumpBranches`; no new discovery-branch scheduling rules required for this PRD).
5. **Release before agent/context loop** — once the branch workspace exists and setup shell commands succeeded, release the execution workspace lock so another lump can pre-flight/setup while the first runs the agent on its worktree (protected by the existing branch workspace lock).
6. **Stale lock recovery** — dead PID in lock file → warn, remove, acquire (same pattern as branch workspace lock).

## Non-goals

- **Shared mode** — no execution-workspace lock; pre-flight/setup git work targets the project copy, not the source checkout, so the motivating race does not exist.
- **`discoveryBranch` / multi-branch daemon scan** — out of scope; callers pass the branch pre-flight should reset to via existing `resolvedBaseBranch` resolution.
- **Locking for read-only commands** (`lump-plan`, `lump-status`, `clean`) — no pre-flight / setup in v1.
- **Locking the entire `runLump` duration** on the execution workspace in worktree mode — would block all parallel worktree lumps unnecessarily.
- **Distributed / multi-machine locking** — per host only.
- **Replacing branch workspace lock** — both layers remain; this PRD adds the **execution workspace** layer for the setup window.
- **New CLI flags** (`--force`, `--timeout`) in v1.
- **Changing destructive pre-flight semantics** — see `dedicated-dirty-env-guardrail` PRD.

## User stories / use cases

1. **Two worktree daemons** — I run `start --lumpName A` and `start --lumpName B` on the same dedicated checkout. While A is resetting the main repo and creating its worktree, B waits (logs once), then runs its own pre-flight/setup — never interleaved `git switch` on the same tree.
2. **Daemon + manual run** — Daemon is mid-setup on the execution workspace; `lumpcode run otherLump` fails immediately with "execution workspace in use," not mid-reset corruption.
3. **Checkout strategy (dedicated)** — Execution workspace and branch workspace are the same path; one holder serializes the full run (see "Checkout strategy" below).
4. **Maintainer** — Vitest can simulate two concurrent acquire attempts on the same dedicated execution path and assert wait vs fail without real agents.

## Proposed behavior and UX

### Lock identity

- **Key:** normalized absolute `executionWorkspacePath` in **dedicated mode** (`path.resolve(sourceProjectRoot)` — the checkout used for pre-flight and worktree setup).
- **When:** acquire only when `local.json` `mode` is `dedicated`; shared-mode runs skip this lock entirely.
- **Storage:** `{globalConfigFolderPath}/execution-workspace-locks/<sha256>.lock.json` (separate directory from `branch-workspace-locks/` for clarity and debugging).
- **Payload (JSON):** `pid`, `lumpName`, `executionWorkspacePath`, `startedAt` (ISO), optional `projectName`, optional `phase: 'preflight' | 'setup'`.

### Lock lifecycle (one lump run)

```text
acquire execution workspace lock
  → runProjectPreflight({ targetBranch: resolvedBaseBranch })
  → (existing allowlist / config load — unchanged)
  → acquire branch workspace lock (existing util)
  → runLump(...)
       → setupWorkspaceFn + exec setup command   ← still under execution lock
       → [RELEASE execution workspace lock]        ← after successful setup exec
       → context loop + agent on branch workspace ← branch lock still held
  → release branch workspace lock (finally)
```

If pre-flight or setup fails, release execution lock in `finally` (and branch lock if it was taken).

If the run skips before `runLump` (no todo contexts, `tooManyOpenBranches`, config load failure before lock), **do not** acquire execution lock (mirror branch-lock PRD spirit).

**No gap:** hold the execution lock from the first git command in pre-flight through setup; do not release between pre-flight and setup.

### Wait vs fail

| Caller | `lockMode` |
| --- | --- |
| `lumpcode start` (daemon tick) | `wait` — one **info** line per wait episode (no per-poll spam) |
| `lumpcode run` | `fail` — non-zero exit immediately |

Suggested failure shape (parallel to `branchWorkspaceBusy`):

```typescript
{
  code: 'executionWorkspaceBusy';
  message: string;
  executionWorkspacePath: string;
  holderPid?: number;
  holderLumpName?: string;
}
```

Suggested message:

```text
Execution workspace "<path>" is in use by another lumpcode run (pid <pid>, lump "<name>"). Wait for it to finish or stop the daemon before running again.
```

JSON output (`--json`): include stable `executionWorkspaceBusy` code plus path and optional holder fields.

### Refactor: pre-flight per lump run

Today both `commands/start/main.ts` and `commands/run/main.ts` call `runProjectPreflight` **before** `runLumpFromJsConfig`. The daemon tick pre-flights once to `primaryDiscoveryBranch` only. That is insufficient for parallel per-lump daemons and fights this lock model.

**Decision:** move pre-flight into `runLumpFromJsConfig` and remove outer call sites.

1. Resolve `resolvedBaseBranch` for this lump (`resolveLumpBranches`).
2. Acquire execution workspace lock.
3. `runProjectPreflight({ ..., targetBranch: resolvedBaseBranch })`.
4. Proceed with existing branch-path resolution + branch lock + `runLump`.

Daemon tick body becomes: resolve lump names → for each lump, `runLumpFromJsConfig` (which owns pre-flight + both locks). **Remove** the outer tick-level `runProjectPreflight`. Same for `commands/run/main.ts`.

### Checkout strategy

When `workspaceStrategy === 'checkout'`, `branchWorkspacePath === executionWorkspacePath`.

**Decision:** if paths are equal, use a **single lock for the entire run** — hold execution workspace lock through pre-flight, setup, agent, and per-context git; **skip** acquiring a second branch lock on the same path (avoids double-lock deadlock). Branch exclusivity on the checkout is satisfied by the one execution lock.

### Worktree strategy

- **Execution lock:** pre-flight + setup only (release after setup command succeeds).
- **Branch lock:** from before `runLump` through `finally` (existing), keyed on worktree path — protects agent + per-context git on the worktree.

Two lumps with **different** worktrees may run agents **concurrently** after both have completed setup, but **never** concurrent setup on the shared main checkout.

## Technical approach

### Scope: `packages/apps/cli`

1. **New util** `executionWorkspaceLock/` (mirror `branchWorkspaceLock/`):
   - `acquireExecutionWorkspaceLock({ executionWorkspacePath, lumpName, mode: 'wait' | 'fail', globalConfigFolderPath, projectName?, logger })` → `Success<ReleaseFn>` | `Failure<string | ExecutionWorkspaceBusyError>`
   - `executionWorkspaceLockFilePath`, stale PID handling, wait poll (`WAIT_POLL_MS` ~500, same as branch lock).

2. **`runLumpFromJsConfig/main.ts`** — orchestration hub:
   - Apply `lockMode` to **both** layers in v1 (same `'wait'` / `'fail'` for execution and branch locks).
   - Move `runProjectPreflight` here with per-lump `targetBranch: resolvedBaseBranch`.
   - **Dedicated only:** acquire execution lock → pre-flight → (early exits without branch lock) → branch lock → `runLump` → releases in `finally` / hook. **Shared mode:** no execution lock; keep today's pre-flight path unchanged for shared.
   - Checkout mode (dedicated): if `branchWorkspacePath === executionWorkspacePath`, only execution lock for full run.

3. **`commands/start/main.ts`** — remove tick-level `runProjectPreflight`; pass `lockMode: 'wait'`.

4. **`commands/run/main.ts`** — remove outer `runProjectPreflight`; pass `lockMode: 'fail'` (default).

5. **Tests** (Vitest; prefer real git fixtures):
   - Second acquire fails/waits while first holds execution lock during mocked slow setup.
   - Worktree: two lumps — concurrent branch locks after setup; setup phases do not overlap on execution path.
   - Stale PID recovery.
   - Checkout: same path — no double acquire; single holder for full run.
   - Regression: existing `branchWorkspaceLock` tests still pass.

6. **Docs (minimal):**
   - `DOCS/concepts.md` — under "Three workspaces": pre-flight + worktree setup serialize on the execution workspace; parallel worktree lumps run agents concurrently only after setup.
   - `DOCS/commands.md` — one line on `executionWorkspaceBusy` for manual `run`.

### Scope: `packages/core` (minimal)

Release must happen **after** the setup workspace shell command executes successfully in `executeStepsForContextList`, not when `setupWorkspaceFn` returns the command string.

**Decision:** add optional hook on `RunLumpInput` / `executeStepsForContextList`:

```typescript
afterSetupWorkspaceFn?: (input: { workspacePath: string }) => void | Promise<void>;
```

Invoke once immediately after successful setup exec (~line 101 in `executeStepsForContextList/main.ts`, before the context loop). CLI passes a callback that releases the execution workspace lock.

**Rejected alternative:** split CLI into `prepareLumpWorkspace` + `runLump` with pre-built `workspacePath` — larger refactor; use the hook unless core change is blocked.

### Out of scope packages

`packages/apps/cli/cli-types`, `@lumpcode/cli-utils`, GUI — no changes unless exporting error types later.

## Acceptance criteria

- [ ] **Dedicated mode only:** at most one active holder per `executionWorkspacePath` during pre-flight + setup on a given machine (cross-process test).
- [ ] **Shared mode:** no execution-workspace lock acquired; behavior unchanged from today.
- [ ] Lock released immediately after successful workspace setup exec, before first context/agent step (worktree mode).
- [ ] Parallel worktree daemons in **dedicated mode** (`start --lumpName A` + `start --lumpName B`) do not interleave `git switch` / reset on the same checkout (test or scripted simulation).
- [ ] Daemon waits with one info log line per wait episode; manual `run` fails fast with actionable `executionWorkspaceBusy` message.
- [ ] Stale lock (dead PID) auto-recovered with warning.
- [ ] Pre-flight runs per lump inside `runLumpFromJsConfig` with lump-specific `targetBranch` (`resolvedBaseBranch`), not once per tick at primary branch only.
- [ ] Outer `runProjectPreflight` removed from `commands/run/main.ts` and `commands/start/main.ts` tick loop.
- [ ] Checkout mode: no deadlock from two locks on the same path; single lock covers full run.
- [ ] Existing branch workspace lock behavior unchanged for the agent phase in worktree mode.
- [ ] `packages/apps/cli` Vitest suite passes; new tests cover execution lock wait/fail/stale/checkout/worktree cases.

## Design decisions (formerly open questions)

| Topic | Decision |
| --- | --- |
| Lock storage | Separate `{globalConfigFolderPath}/execution-workspace-locks/` (not merged with branch locks). |
| Core integration | **`afterSetupWorkspaceFn`** hook in core (~5 lines at one call site). |
| Daemon tick pre-flight | **Remove** outer `runProjectPreflight`; only inside `runLumpFromJsConfig`. |
| Dirty tree guardrail | Orthogonal; dirty check still runs inside pre-flight before destructive git (`dedicated-dirty-env-guardrail`). |
| Lock window | Hold from first git command in pre-flight through setup; **no gap** before pre-flight or between pre-flight and setup. |
| Global daemon, many lumps same tick | Each lump acquires/releases sequentially in the tick loop — natural serialization on one checkout; worktree lumps still benefit between ticks/processes. |
| Wait timeout | v1: no timeout (operator stops daemon). Follow-up: `--maxWait` or heartbeat stale detection. |
| Windows | Atomic create + PID stale detection; add Windows case to CI matrix if feasible. |
| Log noise | One log line per wait episode per lump; no per-poll logs. |

## Relationship to existing work

| Item | Scope |
| --- | --- |
| **`fix-in-start-run-no-double-lump-launch`** | Exclusivity on **branch workspace** during agent + per-context git (**implemented**) |
| **This PRD** | Exclusivity on **execution workspace** during pre-flight + **setup** (main checkout / project copy) |
| **`dedicated-dirty-env-guardrail`** | Fail before destructive pre-flight when porcelain dirty |
| **[Multi discovery branches](./multi-project-base-branches.prd.md)** | Supplies `resolvedBaseBranch` / `targetBranch` for pre-flight; this PRD only requires per-lump pre-flight **inside** the lock |
