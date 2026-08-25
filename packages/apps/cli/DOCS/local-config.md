# Local configuration (`.lumpcode/local.json`)

`.lumpcode/local.json` is a **per-machine**, **gitignored** file. **Every command that runs a lump (`run`, `start`) requires it**—Lumpcode hard-fails if it is missing or invalid.

`lumpcode project-setup` scaffolds `{ "mode": "shared" | "dedicated" }` and appends the file to `.gitignore`. Team defaults such as `primaryBranch` and default `command` belong in committed [`.lumpcode/project.json`](project-config.md). Shared keys present in both files resolve with **local wins**.

Legacy keys `discoveryBranch` / `discoveryBranches` are **not** accepted; use `primaryBranch` / `primaryBranches`.

## Minimal example

After `project-setup` (primary lives on `project.json`):

```json
{
  "mode": "shared"
}
```

Machine overrides and lump defaults:

```json
{
  "mode": "dedicated",
  "workspaceStrategy": "worktree",
  "maxParallelRun": 3,
  "verbose": true,
  "primaryBranch": "main"
}
```

## Field membership

| Field | Required | Notes |
|-------|----------|--------|
| `mode` | yes | Local-only |
| `workspaceStrategy` | no | Local-only; default `checkout` after merge |
| `disabled` | no | Local-only; pauses the daemon on this machine (not lump `disabled`) |
| `maxParallelRun` | no | Local-only |
| `primaryBranch` / `primaryBranches` / `projectBaseBranch` | no on this file alone | Shared with `project.json`; **local wins**; after merge, one primary source is required |
| `command` | no | Lump default (tag shape only); local > project; lump > both |
| `maximumNumberOfConcurrentBranches` | no | Lump default; same precedence |
| `keepHistory` | no | Lump default; same precedence |
| `verbose` | no | Lump default; **local-only** (not on `project.json`) |
| `refreshCommand` | no | Shared with `project.json`; **local wins**; dedicated daemon tick only |

Misplaced keys (for example `projectName`) and unknown keys **hard-fail**. `command` must be a registered tag, not a `.ts`/`.js` file path.

Primary may live only on `project.json`. Missing from both files fails with an error naming both files.

Merge and lump-default overlay are described in [project-config.md](project-config.md#merge-and-lump-defaults). Daemon `start` freezes one merged read for the process (restart to pick up edits).

## Modes

### `shared` (default)

You use this clone for your **day-to-day work**. Lumpcode never touches it; every run happens in a **separate copy** at `~/.lumpcode/project-copies/<projectName>/`. The copy is created once and kept up to date by pre-flight on subsequent runs.

```text
~/your-repo/             ← your editor / git client; untouched by Lumpcode
~/.lumpcode/
└── project-copies/<projectName>/   ← Lumpcode runs here
```

Pick `shared` on **workstations**.

### `dedicated`

The clone is **owned by Lumpcode** (typical for a daemon machine on a small server). Lumpcode runs in place: pre-flight does `git fetch && git switch <primaryBranch> && git reset --hard origin/<primaryBranch>` in the checkout itself. **This wipes any uncommitted local changes.** Do not pick `dedicated` for a clone you also edit.

Pick `dedicated` on **machines you don't develop on**, including `lumpcode start` daemons.

## Workspace strategies

### `checkout` (default)

Each lump run switches the main worktree to a fresh `lump/<lumpName>/…` branch (fetch, reset, pull `baseBranch`, then `git switch -c`). When the lump finishes, the workspace switches back to the lump's resolved `baseBranch` (or the primary branch when that is the default).

### `worktree`

Each lump run uses a **linked git worktree** under `.lumpcode/worktrees/<branch>/` inside the execution workspace (the project copy in `shared` mode, the checkout in `dedicated`). The main worktree stays on the lump's resolved `baseBranch` while the agent runs inside the worktree (the **branch workspace**). Worktree paths mirror branch segments (e.g. branch `lump/migrate-vue/Button.tsx` → `.lumpcode/worktrees/lump/migrate-vue/Button.tsx`). `project-setup` gitignores `.lumpcode/worktrees/`. `lumpcode clean` removes worktrees when it deletes lump branches.

Pick `worktree` when you want the base branch checked out in the main tree during runs, or when using `maxParallelRun` so a global daemon can run multiple lumps concurrently in one tick.

## Multiple primary branches (dedicated daemons)

`primaryBranches` lets **one dedicated daemon** serve several integration lines (e.g. `dev` plus every remote `feature/*`). It is a **dedicated-mode feature**: in shared mode a multi-entry list is noted once in the logs and only the exact primary is used (globs are not expanded).

How a dedicated global daemon uses the list, each tick:

1. Expand configured entries (exact kept as-is; globs via `git ls-remote --heads origin <pattern>`). Empty glob matches log and skip that entry; `ls-remote` failure fails the expand path. The resolved primary (first exact) is moved to the front of the concrete list.
2. For **each** concrete scan branch: locked pre-flight, then if frozen merged `refreshCommand` is set, run it in the checkout (`stdio` discarded; failure skips that branch). Then discover lumps whose discovery rules match that branch ([concepts.md § Branch resolution](./concepts.md#branch-resolution)). `refreshCommand` is ignored in shared mode and by `lumpcode run`. Change it and restart the daemon.
3. Per scan branch (subtick): discover loadable lumps, apply the daemon's `--include` / `--exclude` filter, then run the filtered queue (optionally in parallel when `workspaceStrategy` is `"worktree"` and `maxParallelRun` > 1, including `--maxParallelRun` on `start`). Same `lumpName` on different scan branches is allowed and runs once per matching line. A failure on one branch or lump is logged and does not stop the rest of the tick.

Rules:

- Every configured lump discovery rule must be allowlisted against **unexpanded** `primaryBranches` (exact entry, same glob string, or concrete name matching a primary glob).
- The **same `lumpName`** may run on different scan branches; two lumps with the same name on the **same** scan branch fail daemon launch.
- The **primary branch** (project-wide default) is the first **exact** entry in the configured list.

## Pre-flight

See [concepts.md](concepts.md) for execution-workspace pre-flight and locks.

## Related topics

- [project-config.md](./project-config.md) — Committed `project.json`, shared keys, lump defaults
- [concepts.md](./concepts.md) — Branch resolution, concurrency, workspaces
- [get-started.md](./get-started.md) — First-time setup
- [lump-config.md](./lump-config.md) — Per-lump config (may inherit project/local defaults)
- [commands.md](./commands.md) — `project-setup`, `run`, `start`
