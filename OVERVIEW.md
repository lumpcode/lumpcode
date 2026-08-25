# Lumpcode overview

Lumpcode is a **git-first loop manager** for coding agents. It turns large, repetitive, or multi-ticket coding work into long-running **agent loop campaigns** called **lumps**, then drives any CLI agent (Claude, Codex, Aider, Cursor, Copilot, etc.) through them on your machine.

## What problem it solves

Single-chat agents are strong on one file or one task. They are weak at migrations, codemods, test backfills, or a whole feature backlog that must advance over days with normal PR review. Lumpcode does the **loop engineering**: you configure the loop once; it discovers work units, runs the agent, isolates each batch on a git branch, and resumes from remote history after merges.

## Core ideas

| Term | Meaning |
| --- | --- |
| **Lump** | One campaign under `.lumpcode/lumps/<name>/` (context discovery, prompts/steps, agent command). **LUMP** = Loop Using Multiple Prompts. |
| **Context** | One unit of work inside a lump (file, component, ticket). |
| **Marker commit** | Commit whose message includes `LUMP: <lump> - <context>`; remote git history is the source of truth for progress (`toDo` → `branchPushed` → `finished`). |
| **Work branch** | Default `lump/<lumpName>/…`; reviewed via PR merge, not pushed straight to the integration branch. |

Runs are **resumable**: finished contexts are skipped on the next `run` or daemon tick.

## How you use it

1. `npm install -g @lumpcode/cli` (Node 22+)
2. `lumpcode project-setup` then `lumpcode lump-create …`
3. Edit the lump config and `lumpcode run <lumpName>` (or `lumpcode start` for a scheduled daemon)

Agent output lands on its own branch for normal review. Optional daemon ticks through the backlog on a cron.

## Repo shape

Apache 2.0 monorepo (early development). Primary user install is `@lumpcode/cli`. Notable packages:

- `@lumpcode/core` — engine (`runLump`); not the usual install target
- `@lumpcode/cli` — project setup, run, daemon, status, clean
- `@lumpcode/cli-types` / `@lumpcode/cli-utils` / `@lumpcode/recipes` — authoring helpers and recipes

Docs live under `packages/apps/cli/DOCS/` (start with [concepts](packages/apps/cli/DOCS/concepts.md) and [get-started](packages/apps/cli/DOCS/get-started.md)).
