# Lumpcode concepts

This page is the **mental model** for Lumpcode CLI: **agent loop campaigns** (called **lumps**), contexts, status, how one run flows through git, and when to use `lumpcode run` vs `lumpcode start`. If you think of working this way as **loop engineering** (designing the loop that prompts your agent instead of prompting it yourself), a lump is one such loop, configured declaratively. Agent work is reviewed through PR merge. Tutorial: [get-started.md](./get-started.md). Field reference: [lump-config.md](./lump-config.md). Commands: [commands.md](./commands.md).

## Core terms


| Term              | Meaning                                                                                                                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Project**       | A git repo containing both `.git/` and `.lumpcode/`. The CLI stores shared settings in `.lumpcode/project.json` and per-lump configs under `.lumpcode/lumps/` ([project-config.md](./project-config.md)).    |
| **Lump**          | One **agent loop campaign** in `.lumpcode/lumps/<lumpName>/`: context discovery, prompt(s), agent command.                                                         |
| **Context**       | One **unit of work** inside a lump (component, file, group of files, ticket). Has a unique `name` as identifier and string `variables` substituted into prompts as `{VAR}`.                                                    |
| **Prompt step**   | One agent invocation. Multiple steps via `steps`; hooks can branch between them ([lump-config.md](./lump-config.md#prompt-configuration), [advanced-config.md](./advanced-config.md#dynamic-steps)). |
| **Batch**         | The set of contexts processed in one `run` / daemon tick (often one context, more if `numberOfContextsPerBranch > 1`).                                                                                           |
| **Tick**          | One scheduler iteration: for each enabled lump, run the same engine path as `lumpcode run <lumpName>`.                                                                                                           |
| **Work branch**   | Branch Lumpcode creates/updates for the batch. Default `lump/<lumpName>/<contextName…>`, customizable with `branchFn`.                                                                                           |
| **Marker commit** | Commit whose message contains `LUMP: <lumpName> - <contextName>` (Lumpcode writes that string as the subject). **Not configurable** so `clean`, `lump-status`, and `context-status` stay aligned with the engine. When squashing, keep that string in the squash message; if it is gone, status looks `toDo` until `context-status --setToFinished`. |
| **primaryBranch** | First **exact** integration branch from the merged project/local config (`primaryBranches` when set, else `primaryBranch`). Either file may supply it; local wins when both set. See [Branch resolution](#branch-resolution) and [project-config.md](./project-config.md#merge-and-lump-defaults). |
| **baseBranch**  | Per-lump execution integration branch — see [Branch resolution](#branch-resolution). Use `baseBranch` when execution should differ from discovery (e.g. a long-lived release branch). |
| **mode**        | `shared` or `dedicated` (in `.lumpcode/local.json`). Decides whether Lumpcode operates on the current checkout or a separate copy under `~/.lumpcode/project-copies/<projectName>/`. |

**Status** — Per-context progress, derived from **remote** git history and cached in `.lumpcode/lumps/<lumpName>/contextStatusRecord.json`:


| Status         | Meaning                                                           |
| -------------- | ----------------------------------------------------------------- |
| `toDo`         | No marker commit for this context on any remote ref yet           |
| `branchPushed` | Marker commit exists on a branch other than `origin/<baseBranch>`        |
| `finished`     | Marker commit is an ancestor of `origin/<baseBranch>` (typically merged) |


Repeated `run` or daemon ticks are **resumable**: finished contexts are skipped until you change remote history or use `context-status` to mark done manually.

**Ordering:** Per-context `options.priority` (lower runs sooner) and `options.dependsOnContexts` gate which `toDo` contexts are eligible in a batch. A dependency must be **`finished`** on the remote base branch; `branchPushed` does not count. Same-lump deps use the context `name`; cross-lump deps use `<otherLumpName>/<contextName>` (see [types.md § Context](./types.md#context) and [examples.md § 7](./examples.md#7-cross-lump-dependency--run-after-another-lump-finishes)).

**Safety:** Lumpcode does **not** push routine agent work to `baseBranch`; work lives on `lump/<lumpName>/…` branches for normal review and merge. Cap how many such branches are in flight with **`maximumNumberOfConcurrentBranches`** (per lump or default in `project.json`).

## Three workspaces

Lumpcode uses three path concepts during a run. Engine and command-module APIs keep the historical names `projectRoot` and `workspacePath`; CLI internals use `executionWorkspacePath` for the middle layer.

| Concept | Engine / command API | Meaning |
| ------- | -------------------- | ------- |
| **Project workspace** | `projectRoot` | Source checkout where `.lumpcode/` lives. In `shared` mode your editor clone is never touched; config and history paths are always under this tree. |
| **Execution workspace** | *(CLI only)* | Git repo root Lumpcode runs in after pre-flight: project copy in `shared` mode, the checkout itself in `dedicated` mode. |
| **Branch workspace** | `workspacePath` on `CommandFn` / `SetupWorkspaceFn` | Where the agent and per-context `git add` / `git commit` run for this lump. With `workspaceStrategy: "checkout"`, equals the execution workspace. With `"worktree"`, a linked tree under `.lumpcode/worktrees/<branch>/` inside the execution workspace. |

```text
shared mode:
  project workspace     ~/your-repo/          (untouched)
  execution workspace   ~/.lumpcode/project-copies/<projectName>/
  branch workspace      same as execution (checkout) OR .../worktrees/lump/... (worktree)

dedicated mode:
  project workspace = execution workspace = your checkout
  branch workspace    checkout: same path; worktree: .lumpcode/worktrees/...
```

How runs coordinate over these paths (locks, fail-fast vs wait, worktree parallelism): [Concurrency and locks](#concurrency-and-locks).

Failed or aborted runs still tear down the branch workspace (`teardownFn` / `teardownWorkspaceFn`) after a successful workspace setup. If workspace teardown itself fails after the walk finished, commit/push usually already succeeded; the next preflight resets the execution workspace.

Three subcommand names include “status” (`daemon-status`, `lump-status`, `context-status`) — they check different things; see the comparison table in [commands.md](./commands.md#three-commands-that-mention-status).

## Branch resolution

Lumpcode distinguishes two branch roles per lump. This section is the canonical definition; other pages link here.

- **Discovery branch** — the concrete integration branch a lump is *found and scheduled from* (which checkout state the daemon or `run` reads the lump config and contexts on).
- **Base branch (execution)** — the integration branch work *branches off of*, where marker commits are checked for `finished`, and where the workspace returns after a run.

Resolution sketch:

```text
effectivePrimaryBranches = configured list (exact + optional git globs such as feature/*)
primary                = first exact entry in that list   # fail if none
scanBranches           = expand(effectivePrimaryBranches)  # dedicated only; shared uses exact primary

effectiveDiscovery     = --discoveryBranch <concrete>
                       | first exact lump discovery rule (discoveryBranch / discoveryBranches)
                       | fail if lump discovery is pattern-only without the flag

resolvedBaseBranch     = baseBranch string
                       | BaseBranchFn({ effectiveDiscoveryBranch, contexts })  # JS/TS
                       | effectiveDiscovery
```

The **primary branch** is the first **exact** entry of `primaryBranches` when set, else `primaryBranch`. Glob entries in `primaryBranches` are discovery/scan rules only (dedicated expands them via `git ls-remote`); they are never used as checkout refs. Shared mode does not expand globs.

Per-lump **`discoveryBranch`** or **`discoveryBranches`** (mutually exclusive) accept exact names and/or git refname globs. Dedicated allowlist checks each rule against **configured** (unexpanded) `primaryBranches` (exact match, pattern-entry equality, or concrete via a primary glob). Shared mode ignores lump discovery rules for scheduling. Manual `run` / `lump-plan` / `lump-status` without `--discoveryBranch` use the first exact discovery rule; pattern-only lumps require a concrete `--discoveryBranch`. Author `getContextListFn` / `contextMatchFn` receive that concrete `discoveryBranch`.

`maximumNumberOfConcurrentBranches` remains a single cap per `lumpName` across all discovery lines. Multiple primary branches / globs: [local-config.md § Multiple primary branches](./local-config.md#multiple-primary-branches-dedicated-daemons).

## One run, end to end

Operator sketch for `lumpcode run <lumpName>` (same per-lump path a daemon tick uses after discovery/filters). Full hook call sites: [advanced-config.md § Hook lifecycle](./advanced-config.md#hook-lifecycle) (separate **shared** and **dedicated** schemas).

**Shared** — load from the source checkout; preflight only the copy at workspace setup:

```mermaid
flowchart TD
  start["lumpcode run myLump"]
  load["Load config from source + disabled"]
  contexts["Context source + status → todo list"]
  branch["branchFn"]
  setup["auto: locks + preflight copy @ baseBranch<br/>+ branch workspace"]
  loop["Per context: setup → steps → teardown → commit"]
  push["git push origin"]
  teardown["auto: workspace teardown + unlock"]
  refresh["Refresh contextStatusRecord.json"]
  start --> load --> contexts --> branch --> setup --> loop --> push --> teardown --> refresh
```

**Dedicated** — discovery preflight on the checkout, then a later base-branch preflight at workspace setup:

```mermaid
flowchart TD
  start["lumpcode run myLump"]
  resolve["Resolve discoveryBranch"]
  dPre["auto: locked discovery preflight"]
  load["Load config + disabled + allowlist"]
  contexts["Context source + status → todo list"]
  branch["branchFn"]
  setup["auto: locks + preflight checkout @ baseBranch<br/>+ branch workspace"]
  loop["Per context: setup → steps → teardown → commit"]
  push["git push origin"]
  teardown["auto: workspace teardown + unlock"]
  refresh["Refresh contextStatusRecord.json"]
  start --> resolve --> dPre --> load --> contexts --> branch --> setup --> loop --> push --> teardown --> refresh
```

Order notes:

1. **Dedicated** resolves a concrete discovery branch and preflights the checkout there **before** config load; **shared** loads config from the source project workspace and preflights only the **copy** at workspace-setup time (`resolvedBaseBranch`). Neither path uses `git pull`; both use fetch / switch / hard-reset. See [Pre-flight and modes](#pre-flight-and-modes).
2. Context discovery and the status-driven todo list run **before** branch workspace setup. Author hooks (`setupFn`, `promptFn`, …) sit inside the per-context loop after setup; details only in [advanced-config.md](./advanced-config.md#hook-lifecycle).
3. Execution workspace comes from `local.json.mode`: checkout in `dedicated`, or `~/.lumpcode/project-copies/<projectName>/` in `shared`. See [Three workspaces](#three-workspaces).

When a lump sets **`keepHistory: true`**, each prompt step appends prompt text and agent output to `.lumpcode/lumps/<lumpName>/history/<contextName>.yaml` on disk (gitignored by `project-setup`). See [lump-config.md § Prompt run history](./lump-config.md#prompt-run-history-keephistory).

## Status lifecycle

```mermaid
stateDiagram-v2
  [*] --> toDo
  toDo --> branchPushed: agent runs, branch pushed
  branchPushed --> finished: marker commit reaches origin/baseBranch
  toDo --> finished: lumpcode context-status --setToFinished
```



## When to use `run` vs `start` (daemon)

- **`lumpcode run <lumpName>`** — Run **one tick** for one lump, then exit. Best for **sporadic** work: tickets you step through locally, one-off codemods, or anything you start and review in the same session.
- **`lumpcode start`** — **Scheduler**: on a cron (default every 5 minutes), discovers loadable lumps (dedicated: each primary branch subtick), applies optional `--include` / `--exclude`, and runs the filtered queue (soft-skipping `"disabled": true` at run time). Default daemon id is `global`. With `workspaceStrategy: "worktree"` and `maxParallelRun` > 1, a tick can run multiple matching lumps concurrently. Best for **sustained agent loop campaigns**: run it on a **machine that stays on** (your dev box or a small remote server with the same git push access). You merge good branches; the next tick picks up the next eligible context.

Useful pairings on a server:

- **`maximumNumberOfConcurrentBranches`** (per lump or default in `project.json`) — caps how many open `lump/<lumpName>/*` branches on `origin` exist before a run is skipped (local-only branches are not counted). See [lump-config.md](./lump-config.md#optional-top-level-fields).
- **`mode: "dedicated"`** in `.lumpcode/local.json` — on a server you don't develop on, skip the copy and run pre-flight directly on the checkout. Pre-flight destructively resets the checkout to the primary branch before each tick. See [Pre-flight and modes](#pre-flight-and-modes).
- **`"disabled": true`** on a lump soft-skips that lump on daemon ticks and on manual `lumpcode run` (exit 0) without stopping the scheduler.
- **`--include` / `--exclude`** on `start` — run a subset of lumps in one daemon (or several overlapping daemons with different `--daemonId` values).
- **`maxParallelRun`** in `local.json` or `--maxParallelRun` on `start` (with **`workspaceStrategy: "worktree"`**) — caps how many lumps a daemon tick runs at once. Default `1`. See [Concurrency and locks](#concurrency-and-locks).

**Daemon files** (under `~/.lumpcode/daemons/`):


| File                                 | Role                                               |
| ------------------------------------ | -------------------------------------------------- |
| `<projectName>.<daemonId>.daemon.pid` | PID of the foreground scheduler child             |
| `<projectName>.<daemonId>.daemon.log` | Child stdout/stderr                               |
| `<projectName>.<daemonId>.daemon.meta.json` | `daemonId`, `cronSetup`, filters, `workspaceStrategy`, `inFlightLumpCount` |


**Common flags:** `lumpcode start --foreground`, `lumpcode start --include=backlog,refacto-* --daemonId=agents`. Inspect: `lumpcode daemon-status` (lists all). Stop: `lumpcode stop --daemonId <id>`. Restart: `lumpcode restart --daemonId <id>`.

**Tick behavior:** discover loadable configs (dedicated: one locked discover per primary-branch scan), apply include/exclude, soft-skip disabled lumps at run time, then run the same per-lump path as `lumpcode run <lumpName>` for each match (optionally in parallel under worktree + `maxParallelRun`). Shared vs dedicated tick wrappers and hook order: [advanced-config.md § Hook lifecycle](./advanced-config.md#hook-lifecycle).

```mermaid
flowchart TD
  subgraph sharedTick ["shared tick"]
    s1["Discover loadable lumps"] --> s2["include / exclude"] --> s3["each match = shared run"]
  end
  subgraph dedicatedTick ["dedicated tick"]
    d1["for each scanBranch"] --> d2["locked discover"] --> d3["include / exclude"] --> d4["each match = dedicated run"]
  end
```

Full flag reference: [commands.md](./commands.md).

## Pre-flight and modes

Before every `run` and every daemon tick, Lumpcode runs a **pre-flight** that:

1. Resolves the execution workspace from `local.json.mode`.
2. In that workspace runs `git fetch --no-write-fetch-head origin <branch>`, switches to the target branch (primary branch or a lump's resolved `baseBranch`), then `git reset --hard origin/<branch>` (no `git pull` after reset).

After pre-flight, each lump prepares git inside the execution workspace according to `local.json.workspaceStrategy` (default `checkout`):

- **`checkout`:** fetch `baseBranch`, create a fresh `lump/<lumpName>/<context…>` branch in the main worktree, run, commit, push, then switch back to the lump's resolved `baseBranch`.
- **`worktree`:** add a linked worktree at `.lumpcode/worktrees/<branch>/` (paths mirror branch segments), run the agent there, commit, push, then remove the worktree. The main worktree stays on the lump's resolved `baseBranch`.

The next lump in the same tick starts from a clean, known state.

| `local.json.mode` | Execution workspace | Use when |
| ----------------- | ------------------- | -------- |
| `shared` | A full copy at `~/.lumpcode/project-copies/<projectName>/` (created once, reused thereafter) | You use lumpcode on your personal device next to your day-to-day work — Lumpcode never touches your work and only works on the copy |
| `dedicated` | The current checkout itself | You setup lumpcode as a daemon on a distant server machine you don't develop on; pre-flight runs the destructive in-place reset |

Worktrees always live under the execution workspace (the copy in `shared`, the checkout in `dedicated`). See [local-config.md](./local-config.md#workspace-strategies).

## Concurrency and locks

Lumpcode uses two lock layers so multiple filtered daemons can share one dedicated clone safely:

- **Path locks** — one writer per execution workspace path and per branch workspace (worktree) path.
- **Git common-dir locks** — one writer for Lumpcode-owned mutations against the shared `.git` (pre-flight fetch/switch/reset, worktree add/remove, add/commit/push, and context-status remote refresh). Keyed by `git rev-parse --git-common-dir`. Manual `run` fails with **`gitCommonDirBusy`** when contended; daemons **wait**. Status reads hoist one fetch under the lock, then classify from local remote-tracking refs.

What you need to know as an operator:

- **One writer per workspace path.** Each execution workspace and each branch workspace is protected by its own lock. Two runs never mutate the same path at the same time.
- **One writer per git object database.** Path locks alone do not cover linked worktrees sharing one `.git`. The git-common-dir lock serializes fetch/reset/worktree lifecycle, finish git, and status refresh so overlapping daemons do not corrupt `FETCH_HEAD` or race ref updates.
- **Lock order.** Path lock first, then git-common-dir lock. Git sections stay short; the agent think loop does not hold the git lock. Coding agents should not run `git` themselves (presets typically deny it).
- **Manual `run` fails fast; daemons wait.** If another run or daemon holds a path or git-common-dir lock, `lumpcode run` exits with **`workspacePathBusy`** or **`gitCommonDirBusy`** (with `--json`: `data.code` plus path/holder when known). A daemon tick **waits** and proceeds when the lock frees up.
- **`checkout` strategy = one path lock for the whole run.** Execution and branch workspaces are the same path, so the path lock is held from pre-flight to teardown — one lump at a time per workspace.
- **`worktree` strategy allows agent parallelism.** Pre-flight and worktree setup on the main checkout take the execution-path lock (then release it after setup); agents on different worktrees run **concurrently**, each behind its own branch-workspace lock, while git mutations still serialize on the common-dir lock. A daemon with `maxParallelRun` > 1 in `local.json` schedules up to that many lumps per tick into those worktrees; `"checkout"` stays sequential regardless of `maxParallelRun`.
- **Overlapping filtered daemons** (`--include` / `--daemonId`) on one dedicated clone are supported when every daemon uses `worktree` (and the git-common-dir lock is in play). Full start rules: [commands.md § start](./commands.md#ref-cmd-start).
- **Stale locks self-heal.** After a crash or `lumpcode stop --force`, a lock file may be left behind. The next acquire detects that the holding process is dead and removes the stale lock automatically — no manual cleanup needed.

## Related documentation

- [get-started.md](./get-started.md) — First lump from zero
- [local-config.md](./local-config.md) — Per-machine `local.json` (`mode`, `primaryBranch`, `workspaceStrategy`)
- [lump-config.md](./lump-config.md) — All config keys
- [advanced-config.md](./advanced-config.md#hook-lifecycle) — Shared / dedicated hook lifecycle schemas
- [commands.md](./commands.md) — Every subcommand

