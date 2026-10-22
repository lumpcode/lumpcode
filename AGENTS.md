# AGENTS.md

Lumpcode is a git-first loop manager: a CLI that runs a coding agent through a long campaign of work (a **lump**), one unit of work (a **context**) at a time, and pushes a branch per run for review by PR merge. Progress is marker commits on the git remote; there is no database. Apache 2.0, open source at `lumpcode/lumpcode`. Commit this file and `.agents/` with repo changes so collaborators and hooks share the same context.

## Memory

`.agents/memory/` holds the durable conventions, ontology, and product rules this guide does not repeat. Before a task, read `.agents/memory/AGENTS.md`, then the matching subfolder `AGENTS.md` and topic files. Those nested indexes are not auto-loaded.

| Folder | Read before |
| --- | --- |
| `ontology/` | Touching any core concept (lump, context, status, steps, workspaces, branches, daemon) |
| `domain/` | Changing engine, CLI, daemon, recipe, or lump behavior |
| `code-conventions/` | Writing code, tests, CLI commands, skills, or a release |
| `writing/` | Editing README, `packages/apps/cli/DOCS/`, the website, schemas descriptions, or articles |

Skills live in `.agents/skills/`. After a ticket lands, `capture-learnings` writes its `learnings.md`; `update-memory` turns completed tickets' learnings (and the Learned sections below) into memory and skill updates.

## Preferences

- Limit change scope to the packages named in the task; note follow-up work for other packages separately.
- Write functions as `function` declarations or arrow functions; one destructured object argument for 3+ parameters; return `Success<T>` / `Failure<string>` (`success()` / `failure()` from `@lumpcode/core`) for expected failures.
- Prefer integration tests with real fixtures over mocks; test behavior, not implementation.
- Keep user-facing docs aligned with real CLI behavior, with no implementation detail an operator does not need. One canonical section per cross-cutting topic; link to it instead of re-explaining.
- Say **resumable**, not idempotent. A context is a unit of work, never "one file" or "one PR" by definition.
- Anonymize client and mission material in anything public: no company, industry, or codebase identifiers.
- Ask only blocking questions before a long unattended task, then work autonomously.

## Layout

npm workspaces (not pnpm), Node 22, TypeScript, Vitest, Commander, Zod (CLI only).

| Package | Role |
| --- | --- |
| `packages/core` | `@lumpcode/core`: the engine (`runLump`). No `zod` dependency |
| `packages/apps/cli` | `@lumpcode/cli`: the `lumpcode` command (ncc bundle, no library entry). Docs in `DOCS/<section>/<page>.md`, rendered by the website |
| `packages/apps/cli/cli-types`, `cli-utils` | Published authoring types and `define*` helpers; prefer `cli-utils` |
| `packages/recipes` | `@lumpcode/recipes`: recipe factories and kit |
| `packages/apps/dashboard` | Private: read-only worker dashboard served by `lumpcode dashboard` |
| `packages/apps/website` | Private: lumpcode.com (Nuxt), landing and `/docs` |
| `.lumpcode/` | This repo's own lumps (`backlog`, `qol`, `bugfixes`, `docs`, `ideasToBacklog`, abstraction pair) |

Build order: core → cli-types → cli-utils → recipes → cli. `npm run test -w=<package>` per package; CLI E2E with `npm run test:e2e:ci` after bundle or daemon changes. `npm run website` serves the site. `npm run worktree -- <branch>` creates a dev worktree under `.worktrees/<branch>` (copies `.env` files, runs `npm i`). Git flow: `GIT-FLOW.md` (`dev` integration, `ver/X.Y.Z` releases, merge commits into `main`).

## What not to do

- Do not write that Lumpcode opens pull requests. The CLI stops at `git push`; `openPrPostTeardown` is opt-in.
- Do not add a status store beside git. Marker commits on the remote are the only source of truth.
- Do not document `supervise`, `login`, or `logout` as operator commands.
- Do not import another command's `main` module from a command; shared logic goes in a CLI util.
- Do not put git mutations in `postSetupWorkspace*` / `postTeardownWorkspace*` hooks (they run outside the git lock).
- Do not run `git init` for fixtures outside `os.tmpdir()`.
- Do not store unrelated secrets or VM config under `~/.lumpcode`.

## Learned User Preferences

Continual learning appends new preferences here. `update-memory` moves durable ones into `.agents/memory/` and removes them from this list.

## Learned Workspace Facts

Continual learning appends new facts here. `update-memory` moves durable ones into `.agents/memory/` and removes them from this list.
