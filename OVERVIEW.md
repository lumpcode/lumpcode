# Lumpcode overview

Lumpcode is an open-source CLI (and engine) for **agent loop campaigns**: large coding jobs that are too big for one chat. You configure a **lump** once; Lumpcode drives any CLI agent (Claude, Codex, Aider, Cursor, …) through many similar units of work, one reviewable git branch at a time.

## What it solves

AI agents are strong on a single task. Lumpcode does the **loop engineering**: discover work items (**contexts**), run prompts/steps, commit marker messages, push `lump/…` branches, and resume from remote git history after you merge PRs. Progress lives in git (no account, no database).

Typical uses: migrations, codemods, test/docs sweeps, ticket backlogs, long-running refactors you want to tick forward on a schedule.

## Core ideas

| Term | Meaning |
| --- | --- |
| **Lump** | One campaign under `.lumpcode/lumps/<name>/` (discovery, prompt(s), agent command). |
| **Context** | One unit of work inside a lump (file, group of files, ticket, …). |
| **Marker commit** | Commit containing `LUMP: <lump> - <context>` — how status and resume work. |
| **Worker / daemon** | Optional background scheduler (`lumpcode start`) that ticks lumps on a cron. |

You open and merge PRs; a run stops at `git push`. Opening PRs is opt-in via `@lumpcode/recipes`.

## How you use it

1. `npm install -g @lumpcode/cli` (Node 22+)
2. In a git repo with `origin` push access: `lumpcode project-setup` → `lump-create` → edit config → `lumpcode run`
3. Later: leave a **worker** running (`lumpcode start` on a second clone) so branches keep arriving while you review and merge

## This monorepo

| Package | Role |
| --- | --- |
| `@lumpcode/cli` | Primary product: setup, run, daemon, status |
| `@lumpcode/core` | Engine (`runLump`); not the usual install target |
| `@lumpcode/cli-types` / `@lumpcode/cli-utils` | Typed config and helpers for JS/TS lumps |
| `@lumpcode/recipes` | Backlog recipes, retry loops, PR helper, kit |
| `packages/apps/website` | Public site (Nuxt) |

Apache 2.0. Early development. Docs: [README](./README.md), [concepts](./packages/apps/cli/DOCS/concepts.md), [lumpcode.com/docs](https://www.lumpcode.com/docs).
