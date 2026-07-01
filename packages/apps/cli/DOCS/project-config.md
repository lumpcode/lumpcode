# Project configuration (`.lumpcode/project.json`)

When you run `lumpcode project-setup`, the CLI creates **`.lumpcode/project.json`** at the root of your git repository (next to `.lumpcode/lumps/` and `.lumpcode/commands/`). This file identifies the project for **daemon files**, **project copy** folder names, and human-readable status output.

## Minimal example

```json
{
  "projectName": "my-monorepo"
}
```

## `projectName` rules

- **Required for Lumpcode to run:** After setup, every command that needs a project identity reads **`projectName`** from this file. If `project.json` is missing, `projectName` is empty, or the value is invalid, those commands **fail** with an error that points you to `project-setup` or editing `project.json`.
- **Allowed characters only:** Letters, digits, underscore (`_`), and hyphen (`-`). No spaces or other punctuation (pattern: `^[a-zA-Z0-9_-]+$`).

**`lumpcode project-setup`** writes `projectName` for you: if you omit `--projectName`, it infers a name from **`git remote get-url origin`** (last URL segment, without `.git`) or from the **directory basename**, then normalizes it so it satisfies the rules above. If you pass **`--projectName`**, it must already satisfy the rules (no silent rewriting).

## Schema (other fields optional)

| Field | Type | Description |
|-------|------|-------------|
| `projectName` | string | **Required** for runs once the project exists; see [rules](#projectname-rules) above. Used as-is for daemon filenames under `~/.lumpcode/daemons/` and for `~/.lumpcode/project-copies/<projectName>/` when `local.json.mode` is `shared` |
| `maximumNumberOfConcurrentBranches` | number | Default cap on simultaneously open `lump/<lumpName>/*` branches on `origin` across the project (local-only branches are not counted; a lump can override in its own config) |

Where Lumpcode runs lumps (in-place vs. on a copy), which branch is treated as the project base, and whether the daemon is paused on this machine are **per-machine** settings; they live in `.lumpcode/local.json` instead. See [local-config.md](./local-config.md).

## Why `.lumpcode/` lives next to `.git`

Lumpcode treats a directory as a project root only when it contains both:

- `.git/` — source of truth for branches, remotes, and commit history
- `.lumpcode/` — configuration, per-lump status JSON, and optional custom `commands/*.js`

Keeping both at the repo root lets you **commit** lump definitions with the same revision control as your product code.

## Commit vs. `.gitignore`

**Commit** when:

- Your team should share lump definitions, prompts, and command wrappers
- You want `contextStatusRecord.json` visible for review (optional—some teams prefer local-only state)

**Gitignore** (or omit specific files) when:

- Status files are noisy in PRs (`contextStatusRecord.json`)
- Custom commands embed machine-specific paths or secrets

## Related topics

- [concepts.md](./concepts.md) — Project root, daemon files, workspace copies
- [local-config.md](./local-config.md) — Per-machine `local.json` (`mode`, `projectBaseBranch`)
- [get-started.md](./get-started.md) — First-time setup
- [lump-config.md](./lump-config.md) — Per-lump `config.json` / `config.js` / `config.ts`
- [commands.md](./commands.md) — `project-setup` flags
