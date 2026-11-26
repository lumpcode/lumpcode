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

Build order: core → cli-types → cli-utils → recipes → cli (`npm run build`, Turborepo; the website and `@lumpcode/ui` stay outside that script). `npm run check-types` typechecks every published package, the dashboard and `.lumpcode` (CI and the code lumps run it). `npm run test -w=<package>` per package; CLI E2E with `npm run test:e2e:ci` after bundle or daemon changes. `npm run website` serves the site. `npm run worktree -- <branch>` creates a dev worktree under `.worktrees/<branch>` (copies `.env` files, runs `npm i`). Git flow: `GIT-FLOW.md` (`dev` integration, `ver/X.Y.Z` releases, merge commits into `main`).

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

- TypeScript first (decided 2026-11-23): public docs, website and examples show TypeScript lumps only; JSON keeps working but is labeled experimental, in one "Experimental: JSON configs" section. Do not add JSON or YAML config features (`config-fn-as-script`, `yaml-lump-configs` are parked).
- The way to use Lumpcode is templates: `.lumpcode/templates/<name>.ts` exporting a plain `defineLump(config)` with the team's needs (agent, model, workspace setup, open a PR after push), then lumps that wrap a recipe or their own config in it. Templates are a convention, not a library feature: plain JavaScript decides merging, a repo may have several, and some command options rely on the convention (`lump-create --template`). Say "everything you can code with your agent can become a factory".
- npm is the only distribution (decided 2026-11-24): no SEA or native binaries. The global CLI alone must run and type a TypeScript lump that imports `@lumpcode/*`; never require a project `npm install` for Lumpcode's own packages.
- Opening a PR stays a recipe kit helper (`openPrPostTeardown`), wired in the template, never a CLI feature. The CLI is not linked to GitHub, GitLab, Bitbucket or Azure DevOps.
- Worker deployment is static for now: templates in the repo plus a website page that builds cloud-init or one-click links in the browser. No Lumpcode backend; a paid hosted worker is a later, blocked idea (`hosted-workers`).
- Dashboard auth is one shared password with a login page, not accounts. A non-loopback bind without a password refuses to start.
- Lumpcode is a library first, a CLI second (decided 2026-11-26): `workflow` (one async function with `agent`, `shell`, a returned `succeeded` / `push` / `message` / `variables`) is the main API and steps the second, declarative one. Workflow recipes and kit helpers take the plain names (`featureBacklog`, `retryUntilGreen`); steps versions take a `Steps` / `Step` suffix. Backlog `desc.yml` uses `stages` (`workflow` is its deprecated name). Contract: `workflow-api/requirements.md` in the backlog lump.
- Roadmap and order for this push: `.lumpcode/lumps/backlog/last-20-percent-requirements.md`.

## Learned Workspace Facts

Continual learning appends new facts here. `update-memory` moves durable ones into `.agents/memory/` and removes them from this list.
