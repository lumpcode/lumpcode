# Requirements: `context-status --setToFinished` commits on the local base branch

| Field | Value |
| --- | --- |
| **Backlog** | `set-to-finished-commits-on-local-base` · priority **20** · type **fix** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary `@lumpcode/cli` (`utils/setContextToFinishedStatus`). `commands/context-status`, `@lumpcode/core`, `@lumpcode/recipes`, and docs unchanged. |

## Problem statement and motivation

[Commands](../../../../../../packages/apps/cli/DOCS/reference/commands.md) says `--setToFinished` "writes an empty marker commit on `baseBranch` and pushes that branch. Use after a squash that dropped the `LUMP:` line." [Troubleshooting](../../../../../../packages/apps/cli/DOCS/reference/troubleshooting.md) repeats it: "That pushes an empty marker commit on the base branch."

[`packages/apps/cli/src/utils/setContextToFinishedStatus/main.ts`](../../../../../../packages/apps/cli/src/utils/setContextToFinishedStatus/main.ts) runs `git switch <baseBranch>`, `git commit --allow-empty`, and `git push origin <baseBranch>` in the operator's checkout. The status check before it has already fetched `origin`, but the commit is made on the **local** branch, from the **current index**.

1. After a squash merge on the remote, local `main` is usually behind `origin/main`. The push is rejected as non-fast-forward, so the documented repair fails in its main use case.
2. The failed attempt leaves a marker commit on local `main` (`ahead 1, behind 1`). Each retry adds another one.
3. Files already staged in the operator's checkout go into the "empty" marker commit and are pushed straight to `origin/<baseBranch>`, bypassing review.
4. The operator is left switched onto the base branch instead of the branch they were on.

### Repro (run during bug hunt, built CLI, temp repo under `os.tmpdir()`, `HOME` pointed at a temp dir)

Setup for both cases: bare `remote.git` with `main`; clone `op` with `lumpcode project-setup --projectName demo --mode shared --primaryBranch main`; lump `demo` `config.json`:

```json
{ "baseBranch": "main", "command": "cursor",
  "contextListJson": [{ "name": "ctx-a", "variables": {} }],
  "prompt": { "promptTemplate": "do it" } }
```

**Case A, local base behind origin.** A second clone pushes one commit to `main` (the squash merge). In `op`, `git status -sb` shows `main...origin/main [behind 1]`.

```text
$ lumpcode context-status demo ctx-a --setToFinished
Failed to push base branch "main": Command git push origin main failed …
 ! [rejected]        main -> main (non-fast-forward)
$ git status -sb
## main...origin/main [ahead 1, behind 1]
$ lumpcode context-status demo ctx-a --setToFinished   # retry
 ! [rejected]        main -> main (non-fast-forward)
$ git log --oneline -3 main
e3e1fdb LUMP: demo - ctx-a
25b6cb6 LUMP: demo - ctx-a
282a3c7 add lump
```

**Case B, staged work on another branch.** Local `main` is up to date. The operator is on `feature/wip` with `wip.env` staged.

```text
$ git switch -c feature/wip && echo "API_KEY=do-not-ship" > wip.env && git add wip.env
$ lumpcode context-status demo ctx-a --setToFinished      # exit 0
$ git branch --show-current
main
$ git show --stat --format=%s origin/main
LUMP: demo - ctx-a
 wip.env | 1 +
```

| | Result |
| --- | --- |
| **Actual** | A: push rejected, stray local marker commits pile up. B: staged `wip.env` is pushed to `origin/main` in the marker commit; checkout moved to `main`. |
| **Expected** | A: one empty marker commit lands on top of the current `origin/main`. B: same, with no files in it; `feature/wip`, its index, and its working tree are untouched. |

## Goals

1. `--setToFinished` pushes exactly one commit with no file changes, whose parent is the freshly fetched `origin/<baseBranch>` tip and whose message is the context marker.
2. It never reads or changes the operator's `HEAD`, index, working tree, or local branches.
3. When it fails, it leaves no local commit or branch change behind, so a retry starts clean.

## Non-goals

- How the base branch is chosen. That is `context-status-missing-base-branch` (same command, separate item); this item takes `baseBranch` as given.
- Retrying when someone else pushes to the base between the fetch and the push. A rejected push fails with a message; the operator re-runs.
- Changing the "already finished" no-op, the marker format, or the command's output shape.
- Taking the git-common-dir lock; the fix no longer touches the checkout.

## User stories / use cases

1. As an operator whose squash merge dropped the marker, I run `--setToFinished` without first pulling `main`, and the context becomes `finished`.
2. As an operator mid-work on a feature branch with staged files, I run `--setToFinished`, and nothing of mine leaves my machine or moves.

## Proposed behavior and UX

No new flags, messages on success, or output fields. `context-status` prints the same record.

Contract of the owner, unchanged signature:

```ts
setContextToFinishedStatus({ projectRoot, contextName, lumpName, baseBranch })
  → Promise<Success<void> | Failure<string>>
```

| Situation | Result |
| --- | --- |
| Context already `finished` | `success`, no git writes (unchanged). |
| `origin/<baseBranch>` exists after the refresh | One empty commit, parent = that tip, message = `getGitCommitMessage(...)`, pushed as a fast-forward to `refs/heads/<baseBranch>` on `origin`. |
| `origin/<baseBranch>` missing | `failure` naming the missing remote branch. No commit. |
| Push rejected | `failure` with git's message. No local ref changed. |

## Technical approach

| Step | File | Change |
| --- | --- | --- |
| 1 | `packages/apps/cli/src/utils/setContextToFinishedStatus/main.ts` | Drop `git switch`, `git commit`, and the local-branch push. After the existing status check (which refreshes remote-tracking refs), build the marker commit from `origin/<baseBranch>`'s tree with that tip as its only parent (git plumbing such as `commit-tree`, so no ref, index, or working-tree change), then push that commit to `refs/heads/<baseBranch>` on `origin`. Quote the message and branch with `shellSingleQuote`, as `makeGatedGitFns` does. |

Owner: `setContextToFinishedStatus`. `commands/context-status` keeps calling it and must not add its own git writes.

## Testing strategy

| Level | Test | Covers |
| --- | --- | --- |
| Unit | `packages/apps/cli/src/utils/setContextToFinishedStatus/unit.test.ts`: second clone pushes to `main` first, so local `main` is behind | `success`; `origin/main` tip is the marker, parent is the other clone's commit; status is `finished`; local `main` unchanged. |
| Unit | same file: on a feature branch with a staged file | `success`; marker commit on `origin/main` has no file changes; current branch, staged file, and working tree unchanged. |
| Unit | same file: base branch missing on `origin` | `failure`; no local ref changed. |
| Unit | same file: existing "creates an empty commit" case | **Update**: it asserts the marker is the subject of local `main`. Assert it on `origin/main` only. |
| Unit | same file: existing no-op, other-lump, and cross-lump cases | Pass unchanged. |
| Unit | `packages/apps/cli/src/commands/context-status/unit.test.ts` existing `--setToFinished` case | Pass unchanged. |

## Acceptance criteria

1. Case A of the repro: one `--setToFinished` run exits 0 without a prior `git pull`, `origin/main` gains exactly one marker commit on top of the squash commit, and local `main` is unchanged.
2. Case B of the repro: the marker commit on `origin/main` changes no files; the operator is still on `feature/wip` with `wip.env` staged.
3. A failed run leaves `git rev-parse` of every local branch and `HEAD` as they were before it.
4. `setContextToFinishedStatus` contains no `git switch`, `git checkout`, `git commit`, or `git add`.
5. `npm run test -w=@lumpcode/cli` is green.
