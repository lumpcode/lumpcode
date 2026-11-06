# Requirements: merged lump branches stop counting toward the open-branch cap

| Field | Value |
| --- | --- |
| **Backlog** | `merged-lump-branches-count-as-open` · priority **16** · type **fix** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary: `@lumpcode/cli` (`utils/countOpenLumpBranches`, `utils/listRemoteHeadBranches`, new `utils/isReachableFromNonLumpRemoteHead`, `commands/clean/main.ts` for one shared predicate). `@lumpcode/core` and `@lumpcode/recipes` unchanged. |

## Problem statement and motivation

`maximumNumberOfConcurrentBranches` is meant to make a dedicated worker wait for reviews. It counts `lump/<lumpName>/*` heads from `git ls-remote --heads origin` (`countOpenLumpBranches`) and nothing else. A branch whose pull request was already merged stays on origin unless the host deletes it on merge, so it still counts. Context status already treats the same work as `finished`, so the lump looks done in `lump-status` and stuck in the daemon log at the same time.

Repro (dedicated mode, any host without delete-branch-on-merge):

1. Lump `demo` with `maximumNumberOfConcurrentBranches: 1` and two contexts.
2. Run once. `lump/demo/ctx-a` is pushed.
3. Merge it into `main` with a merge commit (or fast-forward) and push `main`. Do not delete `lump/demo/ctx-a`.
4. Run again (or wait for the next daemon tick). The run returns `skipped: true`, `reason: 'tooManyOpenBranches'`, `openBranchCount: 1`, and `ctx-b` never starts. `lump-plan` reports the same skip.
5. `lumpcode lump-status` shows `ctx-a` as `finished`.

Pain points:

1. A capped lump stalls forever after its first merge unless the operator deletes branches by hand or changes host settings.
2. The cap and context status disagree about what is still open.
3. The docs have to tell operators to work around it (`start/worker.md`, `reference/troubleshooting.md`).

## Goals

1. A `lump/<lumpName>/*` branch on origin whose tip commit is reachable from any origin head outside `lump/` does not count toward `maximumNumberOfConcurrentBranches`.
2. `lumpcode run`, daemon ticks, and `lump-plan` keep reporting the same count, because they all go through `countOpenLumpBranches`.
3. When Lumpcode cannot tell, the branch counts as open (today's behavior), so the fix can only lower the count.

## Non-goals

- Squash merges and rebase merges. The branch tip is not an ancestor of the base after those, so the branch still counts until it is deleted. Docs say so.
- Deleting merged branches automatically. `lumpcode clean` and host settings stay the way to remove refs.
- Fetching inside the cap check, or taking the git-common-dir lock for it. It reads the existing remote-tracking refs only.
- Changing context status, `lump-status`, `context-status`, or how `clean --contextName` chooses branches.
- Per-scan-branch caps. The cap stays lump-wide.
- New config fields or CLI flags.

## User stories / use cases

1. As an operator on a host that keeps merged branches — after I merge a lump's pull request with a merge commit, the worker starts the next context on its next tick without me running `clean`.
2. As an operator previewing with `lump-plan` — the plan shows the next branch instead of a `tooManyOpenBranches` skip once the earlier branch is merged.
3. As an operator who squash-merges — I read in the docs that I still need delete-branch-on-merge or `clean`.

## Proposed behavior and UX

### Merged rule

A remote lump branch is **merged** when its tip commit hash (from `ls-remote`) is contained in at least one local remote-tracking ref under `refs/remotes/origin/` whose branch name does not start with `lump/` (`LUMP_BRANCH_PREFIX`). `origin/HEAD` counts as outside `lump/`, the same as `clean` today.

| Situation | Counted as open |
| --- | --- |
| Tip not reachable from any non-lump `origin/*` ref | yes |
| Tip reachable from `origin/main`, `origin/dev`, `origin/feature/x`, … (merge commit or fast-forward) | no |
| Tip reachable only from another `origin/lump/...` ref | yes |
| Tip object missing locally (pushed from another clone, not fetched yet) | yes |
| Any git error during the check | yes |
| Squash or rebase merge (tip not an ancestor) | yes |
| `ls-remote` fails | whole count is `0` (unchanged) |

Remote-tracking refs are whatever the clone already has. The daemon's discovery preflight and `run`'s preflight fetch the base branch, so a merge is seen on the tick after the base is fetched. A stale ref can only make the count higher, never lower.

### Contracts

`countOpenLumpBranches({ executionWorkspacePath, lumpName }) → Promise<number>`: signature unchanged. Returns the number of remote `lump/<lumpName>/*` heads that are not merged by the rule above. Its doc comment states the merged rule.

`listRemoteHeadRefs({ cwd, branchGlob, postFilterBranchShortName?, timeoutMillis? }) → Promise<Success<{ branchName: string; commitHash: string }[]> | Failure<ListRemoteHeadBranchesFailure>>`: new export in `utils/listRemoteHeadBranches/main.ts`. Same `ls-remote` call, same filter and dedupe as `listRemoteHeadBranches`, but keeps the hash. `listRemoteHeadBranches` keeps its signature and returns the names from `listRemoteHeadRefs`, so there is one `ls-remote` parser.

`isReachableFromNonLumpRemoteHead({ cwd, commitHash }) → Promise<boolean>`: new util `packages/apps/cli/src/utils/isReachableFromNonLumpRemoteHead/` (`main.ts`, `index.ts`, `unit.test.ts`, utils barrel). Lists `refs/remotes/origin/` refs that contain `commitHash` (for example `git for-each-ref --contains`) and returns true when one of them is outside `lump/`. Returns false on any git failure. Never throws.

`isNonLumpRemoteTrackingRef(refShortName: string) → boolean`: exported from the same util. Moved from `clean`'s private `remoteTrackingHeadOutsideLump` with the same behavior (`<remote>/<branch>` where `<branch>` does not start with `lump/`; a name with no `/` is false). `clean` imports it instead of keeping its own copy.

`tooManyOpenBranches` skip shapes and `reasonDetail` text in `evaluateTooManyOpenBranchesSkip` and `planLumpFromJsConfig` stay the same. Only the number changes.

## Technical approach

| Step | File | Change |
| --- | --- | --- |
| 1 | `packages/apps/cli/src/utils/listRemoteHeadBranches/main.ts` (+ `index.ts`) | Add `listRemoteHeadRefs`; reimplement `listRemoteHeadBranches` on top of it |
| 2 | `packages/apps/cli/src/utils/isReachableFromNonLumpRemoteHead/` | New util with `isReachableFromNonLumpRemoteHead` and `isNonLumpRemoteTrackingRef`; add to `utils/index.ts` |
| 3 | `packages/apps/cli/src/utils/countOpenLumpBranches/main.ts` | Use `listRemoteHeadRefs`, then count refs for which `isReachableFromNonLumpRemoteHead` is false. Update the doc comment |
| 4 | `packages/apps/cli/src/commands/clean/main.ts` | Replace `remoteTrackingHeadOutsideLump` with the imported `isNonLumpRemoteTrackingRef`. No behavior change |
| 5 | `packages/apps/cli/DOCS/` | Rows below |

Ownership: the merged rule lives only in `isReachableFromNonLumpRemoteHead`. `evaluateTooManyOpenBranchesSkip` and `planLumpFromJsConfig` do not add their own merged check; they keep calling `countOpenLumpBranches`. `ls-remote` output is parsed only in `listRemoteHeadBranches/main.ts`.

## Testing strategy

| Level | What | Where |
| --- | --- | --- |
| Unit | `listRemoteHeadRefs` returns branch names with the hashes `ls-remote` reports; `listRemoteHeadBranches` results unchanged | `utils/listRemoteHeadBranches/unit.test.ts` (add cases; create the file if missing) |
| Unit | `isReachableFromNonLumpRemoteHead`: true after the commit is merged into `origin/main` and fetched; false for an unmerged commit; false when only an `origin/lump/...` ref contains it; false for an unknown hash | `utils/isReachableFromNonLumpRemoteHead/unit.test.ts` |
| Unit | `isNonLumpRemoteTrackingRef`: `origin/main`, `origin/HEAD`, `upstream/dev` true; `origin/lump/x/y` false; `main` false | same |
| Integration (real bare remote, `initBareRemoteAndCheckout`) | Pushed lump branch merged into `main` with `--no-ff`, `main` pushed and fetched → count `0`; fast-forward merge → `0`; one merged + one open → `1`; squash merge → `1`; lump tip pushed from a second clone and not fetched → `1`; existing cases (no branches, local-only, remote failure) unchanged | `utils/countOpenLumpBranches/unit.test.ts` |
| Integration | Dedicated `runLumpFromJsConfig` with `maximumNumberOfConcurrentBranches: 1` and an already-merged lump branch still on origin is not skipped | `utils/runLumpFromJsConfig/unit.test.ts` (next to the existing `tooManyOpenBranches` cases) |
| Integration | `planLumpFromJsConfig` depth `plan` with the same fixture returns a plan, not `skipped` | `utils/planLumpFromJsConfig/unit.test.ts` |
| Existing | `clean` tests stay green unchanged (`--contextName` still skips markers that reached a non-lump head) | `commands/clean/**` |

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/cli/DOCS/config/lump.md` (`maximumNumberOfConcurrentBranches` row) | Counts `lump/<name>/*` branches on origin that are not merged yet. A branch whose tip is already in a non-lump branch (merge commit or fast-forward) does not count |
| `packages/apps/cli/DOCS/start/worker.md` (line about merged branches) | Merged branches stop counting once the worker has fetched the base branch. Squash and rebase merges still count until the branch is deleted: turn on delete-branch-on-merge or run `lumpcode clean --lumpName <name>` |
| `packages/apps/cli/DOCS/reference/troubleshooting.md` (item 4) | Same split: unmerged or squash-merged branches still count; merge or delete them, or run `clean` |

## Acceptance criteria

1. The repro above no longer skips: after a merge-commit or fast-forward merge of `lump/demo/ctx-a`, the next run starts `ctx-b`.
2. `lump-plan` with the same state shows a plan, not a `tooManyOpenBranches` skip.
3. An unmerged branch, a squash-merged branch, and a branch whose tip is not available locally still count.
4. `ls-remote` failure still yields a count of `0`.
5. Skip shapes and messages are unchanged apart from the count.
6. `clean` behavior is unchanged.
7. The merged rule exists in one place (`utils/isReachableFromNonLumpRemoteHead`); no other module checks reachability for the cap, and `clean` no longer defines its own non-lump ref predicate.
8. The three docs pages describe the new rule and the squash/rebase exception.
