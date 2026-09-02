---
title: Commands
description: Every lumpcode subcommand, grouped by what you are trying to do. Flags use camelCase. Arguments come before options.
---

Run `lumpcode` from the repo root that contains `.lumpcode/` and `.git/`. Global flags: `--json` (one result object), `--verbose` (extra engine logs on `run` / `start`). Boolean flags are presence-only: pass the flag for the non-default, omit it for the default. `--help` works on every command.

## Everyday

### `lumpcode run <lumpName>`

One tick for one lump: load, discover todos, run the agent, commit, push.

| Option | Role |
| --- | --- |
| `--discoveryBranch` | Concrete discovery branch. Required when the lump’s rules are pattern-only. Ignored by `run` in shared mode (warned). |

Success includes a skipped run (`disabled`, or too many open `lump/<name>/*` branches). Busy workspace: fails with `workspacePathBusy`. After a dedicated manual run, the checkout is switched back to the branch you were on.

### `lumpcode lump-plan <lumpName>`

Validate and preview. Does **not** reset git, run the agent, commit, or push.

| Option | Role |
| --- | --- |
| `--contexts` | Print resolved names and variables. |
| `--todoOnly` | With the flags below, only what `run` would pick next. |
| `--prompts` | Resolved prompt text and agent argv. |
| `--plan` | Dry-run of branch, git strings, batch. |
| `--contextName` | One context. |
| `--discoveryBranch` | Concrete discovery (shared: filter only). |

Depth: `--plan` > `--prompts` > `--contexts` > validate only. `--prompts` / `--plan` may execute your `promptFn` / dynamic `steps`.

### `lumpcode lump-status`

Recompute `contextStatusRecord.json` from remote git. `--lumpName` optional (all loadable lumps). `--silent` for summary lines only. `--discoveryBranch` as on `lump-plan`.

## Setup

### `lumpcode project-setup`

Creates `.lumpcode/`. Fails if it already exists or the path is not a git work tree.

| Option | Default |
| --- | --- |
| `--projectPath` | `.` |
| `--projectName` | inferred from origin / basename |
| `--mode` | `shared` |
| `--primaryBranch` | `main` |

Writes committed `project.json`, gitignored `local.json`, empty `lumps/` and `commands/`.

### `lumpcode lump-create <lumpName>`

Scaffolds `config.json` / `--config js` / `--config ts`. Fails if a config already exists in that folder. `lumpName` cannot contain `/` or `.` / `..`.

## Worker

These operate on `~/.lumpcode/daemons/<project>.<id>.*`. The default id is `global` (unfiltered). User-facing name is [worker](/docs/start/worker); the CLI still says daemon.

### `lumpcode start`

Detach a worker (omit `--foreground` to background). Discovers loadable lumps each cron fire.

| Option | Role |
| --- | --- |
| `--foreground` | Stay in this terminal. |
| `--cronSetup` | Cron expression. Default `*/5 * * * *`. |
| `--include` / `--exclude` | Comma-separated names or `*` globs. |
| `--daemonId` | `[a-zA-Z0-9_-]+`. Unfiltered default `global`. `--daemonId=global` with any filter fails. |
| `--maxParallelRun` | Worktree only. Overrides `local.json`. |

Project and local config are frozen at start; restart to pick up edits. Empty include match still stays up. Overlapping filtered workers are allowed; locks coordinate. Start fails if that id is already running or a peer has corrupt meta.

A single exact `--include=myLump` auto-ids as `myLump` (then `myLump-2`, …). Several names or globs get `d-` plus 6 hex.

### `lumpcode stop`

| Option | Role |
| --- | --- |
| `--daemonId` | Default `global`. |
| `--all` | Every worker for this project, then the supervisor. |
| `--force` | Tree-kill immediately. Does not need readable meta. |

Idle stop: SIGTERM, wait 5s, remove pid/meta/desired. Mid-run graceful stop **refuses** (`daemonBusy`). Corrupt meta without `--force` also refuses. `--all` is the only way to stop the supervisor `start` launched; you do not run that process yourself.

### `lumpcode restart [--daemonId]`

Stop then start from `desired.json`. Mid-run still refuses unless you force-stop first.

### `lumpcode daemon-status [--daemonId]`

No flags: list workers plus whether the supervisor is running. With id: one worker’s cron, filters, in-flight count.

### `lumpcode daemon-log`

Follows the log by default. `--noFollow` prints and exits. `--lines` limits the initial tail. `--daemonId` default `global`.

> [!NOTE]
> Verbose lump logs can grow without bound. `stop --all` deletes them as part of teardown.

## Repair

### `lumpcode context-status <lumpName> <contextName>`

One row after refresh. `--setToFinished` writes an empty marker commit on `baseBranch` and pushes that branch. Use after a squash that dropped the `LUMP:` line.

### `lumpcode clean`

Deletes Lumpcode branches locally and on origin. `--lumpName` scopes to `lump/<name>/*`. `--contextName` requires `--lumpName` and matches branches that contain that marker.

### `lumpcode reset-presets`

Overwrite `~/.lumpcode/commands/presets/` with shipped modules. No project required.

## Three commands named “status”

Do not mix these up with the three **context** states (`toDo`, `branchPushed`, `finished`).

| Command | Answers |
| --- | --- |
| `daemon-status` | Is the worker process up? |
| `lump-status` | Per-context git status for a lump. |
| `context-status` | One context row; optional force-finished. |
