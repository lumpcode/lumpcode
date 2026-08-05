# Project configuration (`.lumpcode/project.json`)

When you run `lumpcode project-setup`, the CLI creates **`.lumpcode/project.json`** at the root of your git repository (next to `.lumpcode/lumps/` and `.lumpcode/commands/`). Commit this file. It identifies the project and can hold **team defaults** that every machine and lump inherits unless overridden.

## Minimal example

```json
{
  "projectName": "my-monorepo",
  "primaryBranch": "dev"
}
```

With lump defaults:

```json
{
  "projectName": "my-monorepo",
  "primaryBranch": "dev",
  "command": "cursor",
  "maximumNumberOfConcurrentBranches": 2,
  "keepHistory": true
}
```

## `projectName` rules

- **Required:** Letters, digits, underscore (`_`), and hyphen (`-`) only (`^[a-zA-Z0-9_-]+$`).
- Used for daemon filenames under `~/.lumpcode/daemons/` and for `~/.lumpcode/project-copies/<projectName>/` when `local.json.mode` is `shared`.
- **`lumpcode project-setup`** writes `projectName` (from `--projectName` or inferred from `git remote get-url origin` / directory basename) and `primaryBranch` (from `--primaryBranch`, default `main`).

## Field membership

| Field | Required | Notes |
|-------|----------|--------|
| `projectName` | yes | Project-only |
| `primaryBranch` / `primaryBranches` / `projectBaseBranch` | no on this file alone | Shared with `local.json`; local wins; after merge, one primary source is required |
| `command` | no | Lump default; **tag shape only** (not a `.ts`/`.js` path) |
| `maximumNumberOfConcurrentBranches` | no | Lump default |
| `keepHistory` | no | Lump default |

Not allowed here: `mode`, `workspaceStrategy`, `disabled`, `maxParallelRun`, `verbose`. Unknown keys hard-fail.

## Merge and lump defaults

**Project + local:** for every shared key present on both layers, **local wins**. Keys only on one layer use that layer. Omitted `workspaceStrategy` defaults to `checkout` on the merged result.

**Primary branch:** after merge, require a non-empty primary source (`primaryBranches` non-empty, or `primaryBranch`, or deprecated `projectBaseBranch`). Either file may supply it.

**Lump defaults** (`command`, `maximumNumberOfConcurrentBranches`, `keepHistory`, `verbose`):

Precedence where the field exists on that layer: **lump > local > project**. Inherit only when the lump value is `undefined`. Values such as `false` or `0` are not overridden. `verbose` never comes from `project.json`.

`run`, `start`, `lump-plan`, and `lump-status` all apply the same merge and defaults. Daemon `start` freezes one merged read at process start.

## Why `.lumpcode/` lives next to `.git`

Lumpcode treats a directory as a project root only when it contains both:

- `.git/` — source of truth for branches, remotes, and commit history
- `.lumpcode/` — configuration, per-lump status JSON, and optional custom `commands/*.js`

Keeping both at the repo root lets you **commit** lump definitions with the same revision control as your product code.

## Commit vs. `.gitignore`

**Commit** `project.json` and lump definitions. **Gitignore** `local.json` (per-machine). See [local-config.md](local-config.md).

## Related topics

- [local-config.md](./local-config.md) — Per-machine `local.json`, merge rules pointer
- [concepts.md](./concepts.md) — Project root, daemon files, workspace copies
- [get-started.md](./get-started.md) — First-time setup
- [lump-config.md](./lump-config.md) — Per-lump `config.json` / `config.js` / `config.ts`
- [commands.md](./commands.md) — `project-setup` flags
