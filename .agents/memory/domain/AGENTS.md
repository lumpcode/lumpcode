# Domain

Rules about how Lumpcode behaves: engine, CLI, daemon, recipes, and the lumps this repo runs.

| File | Holds |
| --- | --- |
| `branch-resolution.md` | Primary, discovery, and base branches; shared versus dedicated behavior. Canonical user doc: `packages/apps/cli/DOCS/start/run.md` |
| `commands-and-presets.md` | Agent command modules, shipped presets, preset options, TypeScript lump loading, prompt-file rules |
| `context-sourcing.md` | The three mutually exclusive ways a lump finds contexts |
| `daemon.md` | Scheduler identity, start/stop/restart, supervisor, desired.json, ticks, daemon files |
| `distribution.md` | How the CLI is installed and packaged: npm, launcher, postinstall, SEA binaries |
| `engine-lifecycle.md` | What `runLump` does per run and per context, failure reasons, history and transcripts, process spawning and killing |
| `locks.md` | Path locks and the git-common-dir lock, phase 1 / phase 2 handoff (CLI only) |
| `project-config.md` | Project root, `project.json`, and per-machine `local.json` |
| `recipes.md` | Behavior of `@lumpcode/recipes`: recipe factories, kit helpers, backlog item fields |
| `repo-lumps.md` | The lumps this repo runs on itself (`.lumpcode/lumps/`) |
| `workspaces.md` | Execution and branch workspaces, checkout versus worktree, pre-flight, the open-branch cap, and `clean` |
