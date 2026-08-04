# Local configuration (`.lumpcode/local.json`)

`.lumpcode/local.json` is a **per-machine**, **gitignored** file that tells Lumpcode where and how to run lumps from the current checkout. **Every command that runs a lump (`run`, `start`) requires it**—Lumpcode hard-fails if it is missing or invalid.

`lumpcode project-setup` scaffolds the file with safe defaults and appends it to `.gitignore` so it never makes it into commits or shared branches.

Legacy keys `discoveryBranch` / `discoveryBranches` are **not** accepted; use `primaryBranch` / `primaryBranches`.

## Minimal example

```json
{
  "mode": "shared",
  "primaryBranch": "main",
  "workspaceStrategy": "checkout"
}
```

## Fields

| Field | Type | Description |
|-------|------|-------------|
| `mode` | `"shared"` \| `"dedicated"` | How Lumpcode treats the current checkout. See [Modes](#modes) below. |
| `primaryBranch` | string | Singular primary integration branch for this install. Required when `primaryBranches` is omitted. Also the default lump `baseBranch` when a lump omits both `baseBranch` and `discoveryBranch`. Status checks (`finished`) compare against each lump's resolved `baseBranch` (typically this branch). |
| `primaryBranches` | string[] | Ordered list of integration lines the dedicated daemon scans each tick. Entries may be exact names or git `ls-remote` globs (e.g. `feature/*`). When non-empty, wins over singular `primaryBranch`. The **primary branch** is the first **exact** entry (all-glob configs fail). Dedicated expands globs each launch/tick; shared does not. See [Multiple primary branches](#multiple-primary-branches-dedicated-daemons). |
| `workspaceStrategy` | `"checkout"` \| `"worktree"` | How each lump run prepares git inside the [execution workspace](concepts.md#three-workspaces). Default: `"checkout"`. See [Workspace strategies](#workspace-strategies). |
| `disabled` | boolean | When `true`, the background daemon (`lumpcode start`) skips every lump on this machine without stopping the scheduler. Manual `lumpcode run` is unaffected. |
| `maxParallelRun` | positive integer | Cap on concurrent lump runs in one **global** daemon tick when `workspaceStrategy` is `"worktree"`. Default `1` (sequential). Ignored for per-lump daemons and under `"checkout"`. See [concepts.md § Concurrency and locks](./concepts.md#concurrency-and-locks). |

`mode` and either `primaryBranch` or `primaryBranches` are **required**. `workspaceStrategy`, `disabled`, and `maxParallelRun` are optional (`workspaceStrategy` defaults to `"checkout"` when omitted; `maxParallelRun` defaults to `1`). Unknown fields are rejected.

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

Pick `worktree` when you want the base branch checked out in the main tree during runs, or when using `maxParallelRun` so a daemon can run multiple matching lumps concurrently in one tick.

## Multiple primary branches (dedicated daemons)

`primaryBranches` lets **one dedicated daemon** serve several integration lines (e.g. `dev` plus every remote `feature/*`). It is a **dedicated-mode feature**: in shared mode a multi-entry list is noted once in the logs and only the exact primary is used (globs are not expanded).

How a dedicated daemon uses the list, each tick:

1. Expand configured entries (exact kept as-is; globs via `git ls-remote --heads origin <pattern>`). Empty glob matches log and skip that entry; `ls-remote` failure fails the expand path.
2. For **each** concrete scan branch in expand order: locked pre-flight, then discover lumps whose discovery rules match that branch ([concepts.md § Branch resolution](./concepts.md#branch-resolution)).
3. Merge into **one** tick-wide queue (same `lumpName` on different scan branches is allowed and runs once per matching line), apply the daemon's `--include` / `--exclude` filters, then run the queue (optionally in parallel when `workspaceStrategy` is `"worktree"` and `maxParallelRun` > 1, including CLI `--maxParallelRun` override). A failure on one branch or lump is logged and does not stop the rest of the tick.

Rules:

- Every configured lump discovery rule must be allowlisted against **unexpanded** `primaryBranches` (exact entry, same glob string, or concrete name matching a primary glob).
- The **same `lumpName`** may run on different scan branches; two lumps with the same name on the **same** scan branch fail daemon launch.
- The **primary branch** (project-wide default) is the first **exact** entry in the configured list.

## Pre-flight

Pre-flight mechanics (what runs, in which workspace, per mode) are defined once in [concepts.md § Pre-flight and modes](./concepts.md#pre-flight-and-modes). Specific to this file: `mode` selects the execution workspace pre-flight operates on (project copy in `shared`, the checkout itself in `dedicated` — destructive reset), and `workspaceStrategy` selects the per-lump git flow that follows ([Workspace strategies](#workspace-strategies) above).

If pre-flight fails, `run` reports a `commandFailure` and the daemon **skips the tick** (logged to the daemon log) and tries again on the next schedule.

## Commit vs. gitignore

`.lumpcode/local.json` is **gitignored**. `project-setup` writes the entry to `.gitignore` for you. Each machine gets its own `local.json`; you should never share it through git.

## Related topics

- [project-config.md](./project-config.md) — `project.json`, project name rules
- [lump-config.md](./lump-config.md) — Per-lump `config.json` / `config.js` / `config.ts`, optional `baseBranch` override
- [commands.md](./commands.md) — `run` / `start` and other subcommands
- [concepts.md](./concepts.md) — Pre-flight, lifecycle, daemon overview
