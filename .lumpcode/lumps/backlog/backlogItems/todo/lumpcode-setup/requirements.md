# Requirements: Interactive `lumpcode setup`

| Field | Value |
| --- | --- |
| **Backlog** | `lumpcode-setup` · priority **1** · workflow **[manualReq, testImpl, impl]** · `manual: true` (umbrella) |
| **Type** | feature |
| **Status** | Pending implementation (ticketed) |
| **Depends on** | — (`shared-in-place-run` already shipped) |
| **Packages** | Primary: `packages/apps/cli`. Also: `packages/apps/website` (First PR, worker, commands). `@lumpcode/core` (consume `getCodeBasePaths` only), `cli-types`, `cli-utils`, `recipes` unchanged. |

This is the campaign shape. Per-ticket contracts live under `tickets/<name>/requirements.md`.

## Problem statement and motivation

`project-setup` is flag-only create. First-run docs are a multi-command tutorial. Shared `run` is already in-place on this checkout (no copy, no `lump/…`). Operators still bounce between docs and the shell to get a first lump and a first run.

1. No single command that drives project init, first lump, commit, and `run`.
2. `project-setup` cannot resume on a clone that already has `.lumpcode/`.
3. The `lump-create` stub often yields an empty plan.
4. JSON `contextListJson` with a literal path (docs smoke `README.md`) does not match today.

## Global goals and non-goals

**Goals**

1. `lumpcode setup` is the interactive TTY drive: machine checks, optional skill, project + local config, first lump, commit/push, plan then `run`, optional dedicated `start`.
2. `project-setup` stays flag-only create (still refuses if `.lumpcode/` exists). Shared write helpers; do not alias it to `setup`.
3. Resume-from-hole: existing `.lumpcode/` skips completed writes; still asks this machine’s `local.json` mode (and strategy only when dedicated).
4. No-placeholder `contextListJson` values match that relative path exactly.
5. First PR / `get-started.md` happy path is `lumpcode setup` (rehearsal on this branch, then worker).

**Non-goals**

- Opening a PR (`gh`, `openPrPostTeardown`).
- Suggesting or creating a git branch (the developer already cut one to add the tool).
- Scaffolding a custom command module.
- Glob `*` / `{FILE}` in JSON `contextListJson`.
- `--yes` or other prompt-skip flags (that is `project-setup`).
- Changing `project-setup` flag defaults (`primaryBranch` still defaults to `main` when omitted).
- Deprecating `project-setup` or `lump-create`.
- Importing other command `main` modules from `setup`.
- Writing authoring packages into `package.json` on JSON format.
- Documenting `supervise` as an operator command.
- Re-implementing shared in-place `run` (already shipped).

## Key decisions and interfaces

| Decision | Contract |
| --- | --- |
| CLI | `lumpcode setup [--projectPath <dir>]`. TTY required. `--json` fails. No `--mode` / `--yes` / `--lumpName`. |
| Shared `run` | In-place on `HEAD` via `runLumpFromLumpName`. No copy. No `lump/…`. No “cut a branch” prompt. On-base warning comes from `run`, not the wizard. |
| Dedicated `run` / `start` | Unchanged worker path (`lump/…`, reset). `start` only when `mode === 'dedicated'`, via `launchStartDaemon` (`global`). Shared never calls it. |
| `workspaceStrategy` | Ask only when mode is dedicated. Shared `run` ignores it. |
| Dirty leftover after `commitPush` | Shared `run` fails `dirtyWorkTree`. Drive stops. Owner: `assertSourceWorkTreeClean`, not `setup`. |
| Command modules | `setup` must not import `commands/*/main`. |

**Canonical owners** (do not reimplement elsewhere):

| Concern | Owner |
| --- | --- |
| Fresh `.lumpcode/` files + gitignore | `scaffoldLumpcodeProject` |
| Project name infer | `getProjectName` |
| Exact-path `contextListJson` | `makeGetContextListFnFromTemplate` |
| Command tag resolve | `getCommandPath` |
| Dirty / detached shared `run` | `assertSourceWorkTreeClean` |
| Plan / run / start | `planLumpFromJsConfig` / `runLumpFromLumpName` / `launchStartDaemon` |
| Drive prompts + resume + stubs + setup git | `commands/setup` |

## Tickets

| Order | Ticket | Delivers | Requirements |
| --- | --- | --- | --- |
| 1 | `scaffold-lumpcode-project` | Create-only scaffold util; `project-setup` thin wrap | `tickets/scaffold-lumpcode-project/requirements.md` |
| 2 | `exact-path-context-list-json` | Literal `contextListJson` path matches exactly | `tickets/exact-path-context-list-json/requirements.md` |
| 3 | `setup-first-pr-drive` | `lumpcode setup` fresh shared JSON path through in-place `run` | `tickets/setup-first-pr-drive/requirements.md` |
| 4 | `setup-resume-and-worker` | Resume merge + dedicated wipe/start | `tickets/setup-resume-and-worker/requirements.md` |
| 5 | `setup-js-ts-stubs` | js/ts format, authoring pkgs, `contextMatchFn` stub | `tickets/setup-js-ts-stubs/requirements.md` |

1 and 2 have no blockers. 3 is blocked by 1 and 2. 4 and 5 are blocked by 3 only.

## Acceptance criteria for the whole feature

1. `lumpcode setup` is registered; non-TTY and `--json` fail and point at `project-setup`.
2. Fresh shared drive writes config + JSON stub, commits the allowlist, plans, and in-place `run`s on the current branch. Success prints that branch, not `lump/…`, and does not open a PR.
3. `project-setup` still refuses an existing `.lumpcode/` and still writes mode-only `local.json`.
4. Resume does not rewrite `project.json`; still asks mode; skips stub when a lump exists; dedicated can `start` unfiltered `global`.
5. Exact-path `README.md` plans to one legal context. js/ts stub matches suffix files.
6. Shared never calls `launchStartDaemon`. Skill / authoring-pkg install failures do not abort the drive.
7. First PR / get-started / commands / worker / exact-path docs match. No second scaffold or exact-path matcher outside the named owners.
