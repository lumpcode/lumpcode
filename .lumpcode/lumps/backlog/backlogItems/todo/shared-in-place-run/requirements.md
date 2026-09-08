# Requirements: shared in-place run (laptop rehearsal)

| Field | Value |
| --- | --- |
| **Backlog** | `shared-in-place-run` · priority **0** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary `@lumpcode/cli`. `@lumpcode/recipes` (`openPrPostTeardown` skip). Website + CLI `DOCS/` + `articles/`. `@lumpcode/core` unchanged. |

## Problem statement and motivation

Shared mode exists so a laptop can try a lump without a worker. Today it uses `~/.lumpcode/project-copies/<projectName>/`, resets that copy to `origin/<base>`, and cuts `lump/<lumpName>/…`. That fights the authoring loop: write the lump on `make-my-new-lump`, run it, see the result on **that** branch.

1. A second PR (`lump/…`) does not include the authoring-branch delta.
2. The copy desyncs (`npm i` / builds and unpushed commits stay on the laptop).
3. Retry means delete a lump branch and run again.
4. `start` in shared adds a cron on a tree the operator also edits.

## Goals

1. Shared `lumpcode run` executes on the project workspace (this checkout). No copy, no destructive git, no `lump/…` branch.
2. Agent `git add` / commit / push target the current branch. Status stays remote-marker based.
3. Dirty or detached HEAD fails shared `run` before any git write.
4. Running on the execution base (`main` / `dev` / lump `baseBranch`) is allowed. Warn once.
5. `start`, `restart`, and `start --superviseOnly` fail in shared. `stop` / `daemon-status` still work.
6. Dedicated behavior is unchanged (preflight reset, `lump/…`, `refreshCommand` on tick, `start`).
7. User-facing docs, website, and listed articles describe rehearsal vs worker. Do not document in-place shared `run` before this ships.

## Non-goals

- `--retry` / automatic strip of `LUMP:` commits. Redo is `git reset` (document it).
- `refreshCommand` on shared `run`.
- Hashing or recopying the tree. Creating or migrating `project-copies`.
- Auto-deleting leftover `project-copies/` dirs.
- Changing core status (`toDo` / `branchPushed` / `finished`) or marker strings.
- Refusing `run` when `HEAD` is the execution base.
- `lump-plan` / `lump-status` dirty gates or copy preflight.
- New CLI flags (`--in-place`, `--retry`).

## User stories / use cases

1. As an author — I cut `make-my-new-lump`, commit the lump, `lumpcode run`, so the agent commits on this branch and I review one PR.
2. As an author on `main` — my team merges to main. Shared `run` still works and warns that push lands here. After push, the marker on `origin/main` is `finished`.
3. As an author — I `lump-plan` while dirty. Plan still runs. `run` fails until I commit or stash.
4. As an operator — I leave a worker in dedicated and `start`. The laptop in shared cannot `start`.
5. As an author — I dislike the rehearsal commits. I `git reset` to before the `LUMP:` commits and run again.

## Proposed behavior and UX

### Modes

| Mode | `lumpcode run` | `lumpcode start` / `restart` / `start --superviseOnly` |
| --- | --- | --- |
| `shared` | In-place rehearsal (this section) | Fail `sharedModeNoDaemon` |
| `dedicated` | Unchanged | Unchanged |

### Shared `run`

After load + disabled skip, before workspace setup:

1. `assertSourceWorkTreeClean` on `sourceProjectRoot`. Fail if `git status --porcelain` is non-empty (staged, unstaged, untracked; ignored omitted) or HEAD is detached.
2. Resolve current branch (`git rev-parse --abbrev-ref HEAD`). Fail if `HEAD` or empty.
3. If current branch equals `resolvedBaseBranch`, log once: shared run will commit and push on this branch. Do not fail.
4. Do not call `runProjectPreflight` / `runPreflight`. Do not create `project-copies`.
5. `getExecutionWorkspacePath({ mode: 'shared', … })` returns `sourceProjectRoot` (same as dedicated).
6. Skip `evaluateTooManyOpenBranchesSkip` (no `lump/…` created).
7. Path lock the source checkout (`lockMode: 'fail'`).
8. `setupWorkspaceFn` / `teardownWorkspaceFn`: no git. `workspacePath` = `sourceProjectRoot`.
9. `branchFn` returns the current branch name (not `lump/<lumpName>/…`).
10. Existing `gitAddCommitFn` / `gitPushFn` (`git add .`, commit marker, `git push origin <branchName>`).
11. No dedicated restore-branch `finally`.

Porcelain empty and on a named branch → proceed even if the branch is the execution base or has unpushed commits.

### Failures (shared `run`)

CLI `Failure` envelope `messages: [string]`. `--json` includes `data.code`.

| `data.code` | When | Message (exact) |
| --- | --- | --- |
| `dirtyWorkTree` | porcelain non-empty | `Working tree is dirty. Commit or stash before lumpcode run in shared mode.` |
| `detachedHead` | not on a named branch | `Not on a branch. Shared run needs a named branch to commit and push.` |

### Daemon refuse (shared)

| `data.code` | Commands | Message (exact) |
| --- | --- | --- |
| `sharedModeNoDaemon` | `start`, `start --superviseOnly`, `restart` | `lumpcode start is dedicated-only. Use a worker clone with mode: dedicated, or lumpcode run on this laptop.` |

`stop`, `stop --all`, `daemon-status`, `daemon-log` unchanged (reap leftovers).

### `openPrPostTeardown`

Skip unless `branchName` starts with `lump/`. Shared never opens a PR. Dedicated unchanged.

### `refreshCommand`

Dedicated daemon tick only. Shared `run` does not exec it. `validateDaemonLaunch` and dedicated manual `run` still omit it.

### Shared `workspaceStrategy` / `maxParallelRun`

No effect on shared `run` (one checkout). Do not fail start for these: start already fails `sharedModeNoDaemon`.

### Status (unchanged rules, new refs)

`getContextStatus` already scans all `origin` remotes. Push current branch with a marker → `branchPushed` (or `finished` if that branch is `origin/<base>`). Next shared `run` skips those contexts. Local-only marker stays `toDo`.

## Technical approach

Canonical owners. Callers must not reimplement.

| Concern | Owner | Non-owners |
| --- | --- | --- |
| Dirty / detached check | `packages/apps/cli/src/utils/assertSourceWorkTreeClean/` (`assertSourceWorkTreeClean({ cwd }) → Success<{ branchName: string }> \| Failure<{ code: 'dirtyWorkTree' \| 'detachedHead'; message: string }>`) | Command modules, `runPreflight` |
| Shared in-place workspace + `branchFn` | `jsConfigToRunLumpInput` + `makeLumpWorkspaceFns` when `mode === 'shared'` | `runPreflight`, command `main` modules importing each other |
| Skip copy / skip preflight | `runLumpFromJsConfig` / `withWorkspaceLockHooks`: shared does not call `runProjectPreflight` | Phase 1 dedicated discovery |
| `getExecutionWorkspacePath` | That util: both modes return `sourceProjectRoot` | Do not special-case `project-copies` at new call sites |
| Daemon refuse | `assertDedicatedDaemonRequired({ mode }) → Success<void> \| Failure<{ code: 'sharedModeNoDaemon'; message: string }>` | Not inside `assertDaemonStartAllowed` (pid/meta only) |
| Start / superviseOnly / restart call the owner | `commands/start` after merged local config (all paths including `--superviseOnly`); `launchStartDaemon` (covers `restart`) | Companions `stop`, `daemon-status` |
| Open-PR skip | `openPrPostTeardown` in `@lumpcode/recipes` | CLI must not duplicate the `lump/` prefix check |
| Remove shared copy path | `runPreflight`: dedicated-only reset. Delete `ensureProjectCopy` / origin-sync. | — |

Ordered steps:

1. Add `assertSourceWorkTreeClean` and `assertDedicatedDaemonRequired`. Barrel-export from CLI `utils/`.
2. Shared `run` path in `runLumpFromLumpName` / `runLumpFromJsConfig` / `jsConfigToRunLumpInput` / `makeLumpWorkspaceFns` / `getExecutionWorkspacePath` / `withWorkspaceLockHooks`.
3. Wire daemon refuse; invert shared `start` tests.
4. `openPrPostTeardown` `lump/` guard + tests.
5. Drop shared copy from `runPreflight`. `clean` stops targeting `project-copies`.
6. Docs, website, articles, `AGENTS.md` in the same change (behavior must already match).

## Testing strategy

### Unit

| Area | Where | Proves |
| --- | --- | --- |
| Dirty / detached / clean+branch | `assertSourceWorkTreeClean/unit.test.ts` | porcelain, ignored-only, detached, named branch |
| Shared `run` | `runLumpFromLumpName` / `runLumpFromJsConfig` / `jsConfigToRunLumpInput` suites | no `runProjectPreflight`; `workspacePath` = source; `branchFn` = current branch; dirty fails; on-base warns and runs; skip open-branch cap |
| Start refuse | `commands/start` (incl. T7 / S1 / G7 / `--superviseOnly`) | `sharedModeNoDaemon`; discover/refresh not called |
| Restart refuse | `commands/restart` | same code |
| Preflight | `runPreflight/unit.test.ts` | no copy; dedicated reset unchanged |
| `getExecutionWorkspacePath` | its unit test | shared == source |
| Open PR | recipes `openPrPostTeardown` tests | skip non-`lump/` branch; dedicated `lump/` still opens |

### Integration / E2E

Update CLI e2e shared fixtures: no `project-copies`; agent cwd is the fixture repo; push is the current branch. Dedicated e2e unchanged.

Invert or delete tests that require a shared copy or shared `start` success.

## Docs updates

Jobs, not mode names, on user surfaces. `shared` / `dedicated` only next to `local.json`. No `project-copies`. No “never touches this checkout.” Laptop `run` does not create `lump/…`. Worker still does. Do not write **production** on the landing page.

| Document | Change |
| --- | --- |
| `packages/apps/website` First PR | Rehearse on this branch; commit + `run`; then worker. Drop copy / `lump/…` as the first-run PR. |
| Worker page | Laptop run was rehearsal; this clone is the campaign. Dedicated unchanged. |
| Landing | Hero unchanged. Do not teach rehearsal in the hero. Worker loop still “branch you open as a PR.” |
| `/docs/config/local`, `/docs/start/run`, `/docs/start/terms`, `/docs/author/write-a-lump`, `/docs/author/agents` | In-place shared; start dedicated-only. |
| `docs-shared-installation-guide` (docs lump) | Must not contradict. Align or fold into this change. |
| `packages/apps/cli/DOCS/` `concepts.md`, `local-config.md`, `commands.md`, `project-config.md`, `get-started.md`, `advanced-config.md` | Three workspaces: shared project = execution. `start` dedicated-only. `refreshCommand` dedicated tick only. Dirty fail on shared `run`. |
| `articles/05-hands-on-dedicated-daemon` | Kill “checkout untouched” and “review `lump/…` before the daemon.” Laptop `run` on the authoring branch; then merge; worker `lump/…`. |
| `articles/07-setup-abstraction-campaign` | Same laptop line. |
| `articles/01-dedicated-lumpcode-worker` | Worker-only. No laptop copy. |
| `AGENTS.md` | Shared in-place; `getExecutionWorkspacePath`; no shared `start`; no shared copy. |

## Acceptance criteria

1. Shared `run` on a clean named branch commits and pushes that branch. No `project-copies` dir is created. No `lump/…` ref is created.
2. Shared `run` with a dirty tree exits non-zero, `data.code` `dirtyWorkTree`, no commit.
3. Shared `run` on detached HEAD exits `detachedHead`.
4. Shared `run` on `resolvedBaseBranch` when clean succeeds and logs the on-base warning.
5. Dedicated `run` / `start` / tick / `refreshCommand` / `lump/…` / hard reset unchanged.
6. Shared `start`, `start --superviseOnly`, and `restart` fail `sharedModeNoDaemon`. `stop` still works.
7. `openPrPostTeardown` does not open a PR when `branchName` lacks the `lump/` prefix.
8. `lump-plan` still runs on a dirty shared checkout.
9. After shared push of a marker on a non-base branch, `lump-status` is `branchPushed`. After push on the base, `finished`.
10. Docs/website/articles listed above match shipped behavior. Zero user-facing “project copy” / “never touches this checkout” for shared `run`.
11. No second dirty check or start-mode check outside the named owners.

## Reference: shared `run` vs dedicated

```text
shared:  dirty? → lock source → agent cwd = source → commit+push HEAD
dedicated: lock → preflight reset → lump/… branch → agent → push lump/… → restore
```
