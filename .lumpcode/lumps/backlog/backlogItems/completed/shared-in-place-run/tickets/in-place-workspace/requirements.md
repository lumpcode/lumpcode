# Requirements: in-place workspace (shared walk)

| Field | Value |
| --- | --- |
| **Backlog** | `in-place-workspace` · parent `shared-in-place-run` · priority **0** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary `@lumpcode/cli`. `@lumpcode/core` unchanged. No docs in this ticket (`shared-in-place-docs`). No review prompt (`shared-run-review`). |

Umbrella: [parent requirements](../../requirements.md).

## Problem statement and motivation

Shared `run` today copies the repo to `~/.lumpcode/project-copies/<projectName>/`, resets to `origin/<base>`, and cuts `lump/<lumpName>/…`. Authors cannot iterate a lump on the branch they are writing.

## Goals

1. Shared `run` uses `sourceProjectRoot` as execution and branch workspace.
2. No `project-copies`, no `runProjectPreflight` / `runPreflight`, no `lump/…` branch.
3. Walk does not commit or push (`gitAddCommitFn` / `gitPushFn` → `success(undefined)`).
4. Detached HEAD fails before any agent write. Dirty trees are allowed.
5. `HEAD === resolvedBaseBranch` warns once and still runs.
6. Dedicated walk, preflight, and `lump/…` unchanged.

## Non-goals

- Review prompt, LUMP commit after the walk, or any `commands/run` menu.
- Daemon refuse (`shared-mode-no-daemon`).
- `openPrPostTeardown` (`open-pr-lump-prefix`).
- Docs / website / articles.
- Auto-deleting leftover `project-copies/` dirs.
- Changing core status or marker strings.
- New CLI flags.

## User stories / use cases

1. As an author on `make-my-new-lump` (dirty or clean) — `lumpcode run` writes in this repo on this branch and leaves the tree dirty. No copy dir. No `lump/…`. No commit.
2. As an author on detached HEAD — `run` exits `detachedHead` before the agent.
3. As an author on `dev` when that is `resolvedBaseBranch` — `run` warns and proceeds.
4. As an operator in dedicated — copy-less shared changes do not alter reset / `lump/…` / restore.

## Proposed behavior and UX

After load + disabled skip, before workspace setup, in `runLumpFromJsConfig` when `mode === 'shared'`:

1. `assertSharedRunHead({ cwd: sourceProjectRoot })`. Fail only if HEAD is not a named branch.
2. If `branchName === resolvedBaseBranch` (`resolveLumpBaseBranch`, exact string), warn once. Do not fail. Not a glob. Not “any `primaryBranches` entry.”
3. Do not call `runProjectPreflight` / `runPreflight`. Do not create `project-copies`.
4. `getExecutionWorkspacePath`: both modes return `sourceProjectRoot`.
5. Skip `evaluateTooManyOpenBranchesSkip`.
6. Path lock the source checkout (`lockMode: 'fail'`).
7. `setupWorkspaceFn` / `teardownWorkspaceFn`: no git. `workspacePath` = `sourceProjectRoot`.
8. `branchFn` returns the current branch name.
9. Shared `gitAddCommitFn` / `gitPushFn` → `success(undefined)`.
10. No dedicated restore-branch `finally`.

| `data.code` | Message (exact) |
| --- | --- |
| `detachedHead` | `Not on a branch. Shared run needs a named branch.` |

On-base warning (exact):

```text
You are on the execution base (${resolvedBaseBranch}). A LUMP commit you accept, then push, will mark contexts finished on origin/${resolvedBaseBranch}.
```

`runPreflight` is dedicated-only reset. Delete `ensureProjectCopy` / origin-sync. `clean` stops targeting `project-copies`. Leftover copy dirs may remain.

`lump-plan` / `lump-status`: no dirty gate, no copy preflight (already true; do not add one).

## Technical approach

| Concern | Owner | Non-owners |
| --- | --- | --- |
| Detached HEAD | `packages/apps/cli/src/utils/assertSharedRunHead/` (`assertSharedRunHead({ cwd }) → Success<{ branchName: string }> \| Failure<{ code: 'detachedHead'; message: string }>`) called from `runLumpFromJsConfig` when `mode === 'shared'` | `commands/run`, `runPreflight` |
| On-base warn | Same `runLumpFromJsConfig` moment | Command modules |
| Shared git no-ops | `jsConfigToRunLumpInput` when `mode === 'shared'` | Core |
| Shared workspace + `branchFn` | `jsConfigToRunLumpInput` + `makeLumpWorkspaceFns` when `mode === 'shared'` | `runPreflight` |
| Skip copy / skip preflight | `runLumpFromJsConfig` / `withWorkspaceLockHooks` | Phase 1 dedicated discovery |
| `getExecutionWorkspacePath` | That util: both modes return `sourceProjectRoot` | New `project-copies` special cases |
| Drop shared copy | `runPreflight`: dedicated-only. Delete `ensureProjectCopy` | — |

Update `Mode` comment and e2e `createE2eProject` shared workspace helper so shared cwd is the fixture repo. Invert tests that require a shared copy or auto commit/push on shared `run`.

## Testing strategy

| Area | Where | Proves |
| --- | --- | --- |
| Detached / named / dirty | `assertSharedRunHead/unit.test.ts` | detached fails; named succeeds when dirty, clean, ignored-only |
| Shared walk | `runLumpFromLumpName` / `runLumpFromJsConfig` / `jsConfigToRunLumpInput` | no preflight; workspace = source; `branchFn` = current; dirty allowed; detached fails; on-base warn; git no-ops; skip open-branch cap |
| `getExecutionWorkspacePath` | its unit test | shared == source |
| Preflight | `runPreflight/unit.test.ts` | no copy; dedicated reset unchanged |
| `clean` | `commands/clean` suite | does not target `project-copies` |
| E2E shared fixtures | `packages/apps/cli/src/e2e/` | no `project-copies`; agent cwd = fixture repo; no auto push |

Delete or invert live cases that asserted shared copy paths, shared preflight, or shared auto commit/push. Do not skip-in-place.

## Acceptance criteria

1. Shared `run` on a named branch (clean or dirty) writes on this checkout. No `project-copies` dir. No `lump/…` ref. No commit. No push.
2. Detached HEAD → `detachedHead` before agent writes.
3. `HEAD === resolvedBaseBranch` → warn + success.
4. Dedicated preflight / `lump/…` / restore unchanged.
5. `clean` does not create or require `project-copies`.
6. No second detached check outside `assertSharedRunHead` / its `runLumpFromJsConfig` call.
7. No review prompt in this ticket.
