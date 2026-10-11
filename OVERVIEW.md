# Lumpcode overview

Lumpcode is an open-source (Apache 2.0) **loop engineering** tool: a CLI that drives any coding agent (Cursor, Claude, Codex, Copilot, Aider, …) through large, multi-step campaigns on an existing git repo.

## The job

AI agents are strong on one chat or one file. Lumpcode owns the loop around them when the work is too big for that: migrations, codemods, test coverage sweeps, ticket backlogs, or a whole feature roadmap. You design the loop once; Lumpcode runs it, batches work, isolates each batch on a git branch, and resumes from remote history after merges.

## Core ideas

| Term | Meaning |
| --- | --- |
| **Lump** | One agent-loop campaign under `.lumpcode/lumps/<name>/` (contexts, prompts, agent command). **LUMP** also expands to *Loop Using Multiple Prompts*. |
| **Context** | One unit of work inside a lump (a file, a group of files, a ticket). |
| **Marker commit** | Commit message containing `LUMP: <lump> - <context>`; remote git is the source of truth for progress (`toDo` → `branchPushed` → `finished`). |
| **Worker** | A dedicated clone running `lumpcode start` on a schedule so branches keep arriving while you review and merge. |

Runs stop at `git push` of a `lump/…` branch. You open and merge the PR. Lumpcode does not merge for you, and opening PRs is opt-in (recipes), not built-in.

## How you use it

1. Install `@lumpcode/cli` (Node 22+) and a CLI agent on `PATH`.
2. `lumpcode project-setup` / `lumpcode setup`, author a lump config (JSON is enough to start; JS/TS for hooks and recipes).
3. `lumpcode run <lump>` on the laptop for a first batch, or leave a **worker** with `lumpcode start` for unattended ticks.

No account and no database: state lives in your git remote.

## Monorepo shape

| Package | Role |
| --- | --- |
| `@lumpcode/cli` | Primary product: setup, run, daemon/worker, status |
| `@lumpcode/core` | Engine (`runLump`); not the usual install path |
| `@lumpcode/cli-utils` / `@lumpcode/cli-types` | Typed config and helpers for JS/TS lumps |
| `@lumpcode/recipes` | Higher-level patterns (backlogs, retry-until-green, open PR helper) |
| `packages/apps/website` | Public docs/marketing site (Nuxt) |

Still early development. Deeper docs: root `README.md`, `packages/apps/cli/DOCS/`, and [lumpcode.com/docs](https://www.lumpcode.com/docs).
