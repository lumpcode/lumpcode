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
| `primaryBranches` | string[] | Ordered list of integration branches the dedicated daemon scans each tick. When non-empty, wins over singular `primaryBranch`. The **primary branch** is the first entry (or `primaryBranch` when the array is omitted). |
| `workspaceStrategy` | `"checkout"` \| `"worktree"` | How each lump run prepares git inside the [execution workspace](concepts.md#three-workspaces). Default: `"checkout"`. See [Workspace strategies](#workspace-strategies). |
| `disabled` | boolean | When `true`, the background daemon (`lumpcode start`) skips every lump on this machine without stopping the scheduler. Manual `lumpcode run` is unaffected. |

`mode` and either `primaryBranch` or `primaryBranches` are **required**. `workspaceStrategy` and `disabled` are optional (`workspaceStrategy` defaults to `"checkout"` when omitted). Unknown fields are rejected.

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

Pick `worktree` when you want the base branch checked out in the main tree during runs, or when planning parallel lump execution later.

## Pre-flight

Before every `run` and every daemon tick, Lumpcode runs a **pre-flight** that:

1. Resolves the execution workspace from `mode` (project copy in `shared`, the checkout itself in `dedicated`).
2. In that workspace: `git fetch --all && git switch <targetBranch> && git reset --hard origin/<targetBranch> && git pull origin <targetBranch>`. For a lump run, `targetBranch` is that lump's resolved `baseBranch`; for project-wide pre-flight it is the primary branch.

If pre-flight fails, `run` reports a `commandFailure` and the daemon **skips the tick** (logged to the daemon log) and tries again on the next schedule.

After pre-flight, each lump runs its own per-lump git flow on the execution workspace (see [Workspace strategies](#workspace-strategies)): fetch/pull of the lump's `baseBranch` (defaults to `discoveryBranch` on the lump, then the primary branch from this file), then either a checkout branch or a worktree branch workspace. After the lump finishes, checkout mode switches back to the resolved `baseBranch`; worktree mode removes the linked worktree while leaving the main tree on that branch.

## Commit vs. gitignore

`.lumpcode/local.json` is **gitignored**. `project-setup` writes the entry to `.gitignore` for you. Each machine gets its own `local.json`; you should never share it through git.

## Related topics

- [project-config.md](./project-config.md) — `project.json`, project name rules
- [lump-config.md](./lump-config.md) — Per-lump `config.json` / `config.js` / `config.ts`, optional `baseBranch` override
- [commands.md](./commands.md) — `run` / `start` and other subcommands
- [concepts.md](./concepts.md) — Pre-flight, lifecycle, daemon overview
