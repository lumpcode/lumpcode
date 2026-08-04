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
| **Marker commit** | Commit whose subject is exactly `LUMP: <lumpName> - <contextName>`. **Not configurable** so `clean`, `lump-status`, and `context-status` stay aligned with the engine.                                           |
| **primaryBranch** | First integration branch from `.lumpcode/local.json` (`primaryBranches[0]` when set, else `primaryBranch`). Lumpcode pulls it before project-wide pre-flight; it is the default for both discovery and execution — see [Branch resolution](#branch-resolution). |
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

- **Discovery branch** — the integration branch a lump is *found and scheduled from* (which checkout state the daemon or `run` reads the lump config and contexts on).
- **Base branch (execution)** — the integration branch work *branches off of*, where marker commits are checked for `finished`, and where the workspace returns after a run.

Resolution order (first set value wins):

```text
resolved discovery branch = lump discoveryBranch  →  primary branch
resolved base branch      = lump baseBranch  →  lump discoveryBranch  →  primary branch
```

The **primary branch** comes from `.lumpcode/local.json`: the first entry of `primaryBranches` when set, else `primaryBranch`. On a single-branch project you configure nothing — everything resolves to `main` (or whatever your primary branch is).

The per-lump **`discoveryBranch`** field is **dedicated mode only** and must be listed in `local.json` `primaryBranches`; shared mode ignores it with a warning (discovery always reads your source checkout). Set per-lump **`baseBranch`** when execution should target a different branch than discovery (e.g. a long-lived release branch). Multiple primary branches on one dedicated daemon: [local-config.md § Multiple primary branches](./local-config.md#multiple-primary-branches-dedicated-daemons).

## One run, end to end

```mermaid
flowchart LR
  start["lumpcode run myLump"]
  preflight["Pre-flight: pull primaryBranch<br/>(in copy or in place per mode)"]
  discover["Discover contexts<br/>contextListJson / fn / matchFn"]
  checkout["Pull lump baseBranch<br/>work branch lump/myLump/..."]
  agent["Run agent with prompt"]
  history["Optional: append to history/<context>.yaml<br/>when keepHistory is true"]
  commit["git commit<br/>LUMP: myLump - ctx"]
  push["git push origin"]
  refresh["Refresh contextStatusRecord.json"]
  back["Switch back to lump baseBranch"]
  start --> preflight --> discover --> checkout --> agent --> history --> commit --> push --> back --> refresh
```



Pre-flight resolves the **execution workspace** from `local.json.mode`: the checkout itself in `dedicated` mode, or a copy under `~/.lumpcode/project-copies/<projectName>/` in `shared` mode—see [Pre-flight and modes](#pre-flight-and-modes) and [Three workspaces](#three-workspaces).

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
- **`lumpcode start`** — **Scheduler**: on a cron (default every 5 minutes), runs **every** loadable lump in the project (skipping `"disabled": true` at run time, and omitting `"ignoredByGlobalDaemon": true` from the global queue). With `workspaceStrategy: "worktree"` and `maxParallelRun` > 1 in `local.json`, a global tick can run multiple lumps concurrently. Best for **sustained agent loop campaigns**: run it on a **machine that stays on** (your dev box or a small remote server with the same git push access). You merge good branches; the next tick picks up the next eligible context.

Useful pairings on a server:

- **`maximumNumberOfConcurrentBranches`** (per lump or default in `project.json`) — caps how many open `lump/<lumpName>/*` branches on `origin` exist before a run is skipped (local-only branches are not counted). See [lump-config.md](./lump-config.md#optional-top-level-fields).
- **`mode: "dedicated"`** in `.lumpcode/local.json` — on a server you don't develop on, skip the copy and run pre-flight directly on the checkout. Pre-flight destructively resets the checkout to the primary branch before each tick. See [Pre-flight and modes](#pre-flight-and-modes).
- **`"disabled": true`** on a lump — on the next tick, the daemon soft-skips that lump without stopping the scheduler.
- **`"ignoredByGlobalDaemon": true`** on a lump — the global daemon never schedules it; drive it with `start --lumpName` or manual `run` instead.
- **`maxParallelRun`** in `local.json` (with **`workspaceStrategy: "worktree"`**) — caps how many lumps a global daemon tick runs at once. Default `1`. See [Concurrency and locks](#concurrency-and-locks).

**Daemon files** (under `~/.lumpcode/daemons/`):


| File                                 | Role                                               |
| ------------------------------------ | -------------------------------------------------- |
| `<projectName>.daemon.pid`           | PID of the foreground scheduler child              |
| `<projectName>.daemon.log`           | Child stdout/stderr                                |
| `<projectName>.daemon.meta.json`     | Stores `cronSetup`, `workspaceStrategy`, and `inFlightLumpCount` for `restart` / `daemon-status` / `stop` |


**Common flags:** `lumpcode start --foreground` (blocking), `lumpcode start --cronSetup '*/10 * * * *'`. Inspect: `lumpcode daemon-status`. Stop: `lumpcode stop`. Restart: `lumpcode restart`.

**Tick behavior:** list `.lumpcode/lumps/*`, keep directories with loadable `config.json`, `config.js`, or `config.ts`, omit `ignoredByGlobalDaemon` lumps from the global queue, soft-skip disabled lumps at run time, then run the same engine path as `lumpcode run <lumpName>` for each (optionally in parallel under worktree + `maxParallelRun`).

Full flag reference: [commands.md](./commands.md).

## Pre-flight and modes

Before every `run` and every daemon tick, Lumpcode runs a **pre-flight** that:

1. Resolves the execution workspace from `local.json.mode`.
2. In that workspace runs `git fetch --all`, switches to the target branch (primary branch or a lump's resolved `baseBranch`), `git reset --hard origin/<branch>`, then `git pull`.

After pre-flight, each lump prepares git inside the execution workspace according to `local.json.workspaceStrategy` (default `checkout`):

- **`checkout`:** fetch/pull `baseBranch`, create a fresh `lump/<lumpName>/<context…>` branch in the main worktree, run, commit, push, then switch back to the lump's resolved `baseBranch`.
- **`worktree`:** add a linked worktree at `.lumpcode/worktrees/<branch>/` (paths mirror branch segments), run the agent there, commit, push, then remove the worktree. The main worktree stays on the lump's resolved `baseBranch`.

The next lump in the same tick starts from a clean, known state.

| `local.json.mode` | Execution workspace | Use when |
| ----------------- | ------------------- | -------- |
| `shared` | A full copy at `~/.lumpcode/project-copies/<projectName>/` (created once, reused thereafter) | You use lumpcode on your personal device next to your day-to-day work — Lumpcode never touches your work and only works on the copy |
| `dedicated` | The current checkout itself | You setup lumpcode as a daemon on a distant server machine you don't develop on; pre-flight runs the destructive in-place reset |

Worktrees always live under the execution workspace (the copy in `shared`, the checkout in `dedicated`). See [local-config.md](./local-config.md#workspace-strategies).

## Concurrency and locks

Lumpcode serializes work with **per-path locks** so that runs, daemons, and worktrees never fight over the same git checkout. What you need to know as an operator:

- **One writer per workspace path.** Each execution workspace and each branch workspace is protected by its own lock. Two runs never mutate the same path at the same time.
- **Manual `run` fails fast; daemons wait.** If another run or daemon holds the workspace lock, `lumpcode run` exits with a **`workspacePathBusy`** error (with `--json`: `data.code: "workspacePathBusy"` plus the path and the holder's pid/lump when known). A daemon tick instead **waits** for the lock and proceeds when it frees up.
- **`checkout` strategy = one lock for the whole run.** Execution and branch workspaces are the same path, so the lock is held from pre-flight to teardown — one lump at a time per workspace.
- **`worktree` strategy allows parallelism.** Pre-flight and worktree setup on the main checkout are serialized (one lump at a time per machine), but once set up, agents on different worktrees run **concurrently**, each behind its own branch-workspace lock. A **global** daemon with `maxParallelRun` > 1 in `local.json` schedules up to that many lumps per tick into those worktrees; `"checkout"` stays sequential regardless of `maxParallelRun`. Per-lump daemons (`start --lumpName`) always run one lump per tick.
- **Daemon collisions are checked at `start`.** A global daemon refuses to start while any daemon for the project runs; per-lump daemons can coexist only when every running daemon uses the `worktree` strategy. Full rules: [commands.md § start](./commands.md#ref-cmd-start).
- **Stale locks self-heal.** After a crash or `lumpcode stop --force`, a lock file may be left behind. The next acquire detects that the holding process is dead and removes the stale lock automatically — no manual cleanup needed.

## Related documentation

- [get-started.md](./get-started.md) — First lump from zero
- [local-config.md](./local-config.md) — Per-machine `local.json` (`mode`, `primaryBranch`, `workspaceStrategy`)
- [lump-config.md](./lump-config.md) — All config keys
- [commands.md](./commands.md) — Every subcommand

