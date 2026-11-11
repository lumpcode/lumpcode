# Requirements: `clean` reports branches it failed to delete as deleted

| Field | Value |
| --- | --- |
| **Backlog** | `clean-reports-failed-deletes` · priority **20** · type **fix** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary `@lumpcode/cli` (`commands/clean`). `@lumpcode/core`, `@lumpcode/recipes`, and docs unchanged. |

## Problem statement and motivation

[Commands](../../../../../../packages/apps/cli/DOCS/reference/commands.md) says `lumpcode clean` "deletes matching remote refs and local branches". [Troubleshooting](../../../../../../packages/apps/cli/DOCS/reference/troubleshooting.md) points operators at `lumpcode clean --lumpName <name>` to clear open branches that hold back `maximumNumberOfConcurrentBranches`.

[`packages/apps/cli/src/commands/clean/main.ts`](../../../../../../packages/apps/cli/src/commands/clean/main.ts) `deleteRefs` runs `git push --delete origin …` and `git branch -D …` and discards both results. The handler then builds `deletedBranches` from the discovered refs, not from what was deleted, and always returns success.

1. A refused remote delete (protected branch, server hook, no permission, network error) still prints `Cleaned N branch(es)` and exits 0.
2. A local branch that `git branch -D` cannot delete (it is checked out in this worktree) is still listed as deleted.
3. `--json` callers get `data.deletedBranches` naming branches that still exist, so a script cannot tell the cleanup did not happen. The open-branch cap keeps skipping runs with no hint why.

### Repro (run during bug hunt, built CLI, temp repo with a bare `origin`)

Remote refuses deletes with a `pre-receive` hook that exits 1 when the new sha is all zeros. `origin` has `lump/demo/a`.

```text
$ lumpcode clean --lumpName demo --json
{"messages":["Cleaned 1 branch(es)"],"data":{"deletedBranches":["lump/demo/a"]}}
exit 0
$ git ls-remote --heads origin
01761ba…	refs/heads/lump/demo/a
ae84951…	refs/heads/main
```

Local side, hook removed, `lump/demo/b` checked out:

```text
$ lumpcode clean --lumpName demo --json
{"messages":["Cleaned 2 branch(es)"],"data":{"deletedBranches":["lump/demo/a","lump/demo/b"]}}
exit 0
$ git branch --list 'lump/*'
* lump/demo/b
```

| | Result |
| --- | --- |
| **Actual** | Exit 0, every discovered branch listed as deleted, refused ones still exist. |
| **Expected** | Branches that were not deleted are not reported as deleted, and the command fails naming them. |

## Goals

1. `deletedBranches` and the `Cleaned N branch(es)` count only include branches that no longer exist where `clean` tried to delete them.
2. When any remote or local deletion fails, `clean` exits non-zero and its message names each branch that was not deleted, whether it was the remote or the local copy, and git's error text.
3. A failure on one branch does not stop `clean` from deleting the others.

## Non-goals

- Changing which branches are discovered (`--lumpName`, `--contextName`, merged-marker rules).
- Changing worktree removal, which stays best-effort.
- Retrying deletes, or switching the operator off a checked-out lump branch.
- The `git fetch --all` result at the start of the command.

## User stories / use cases

1. As an operator whose `origin` protects branches, I run `clean --lumpName backlog` and see which branches it could not delete, so I know why the open-branch cap still skips runs.
2. As a script calling `clean --json`, I can trust `deletedBranches` and the exit code.

## Proposed behavior and UX

No new flags. Output when every delete succeeds is unchanged.

When at least one delete fails, `clean` returns a failure (non-zero exit, `--json` envelope on stderr). Messages contain one line per branch that was not deleted, shaped like:

```text
Could not delete origin branch "lump/demo/a": <git stderr, trimmed>
Could not delete local branch "lump/demo/b": <git stderr, trimmed>
```

followed by a summary line counting the branches that were deleted (`Cleaned N branch(es); M could not be deleted.`). The exact wording is free; the branch name, side (origin or local), and reason must be present.

A branch counts as deleted for the summary when every copy `clean` targeted (remote, local, or both) was removed.

## Technical approach

| Step | File | Change |
| --- | --- | --- |
| 1 | `packages/apps/cli/src/commands/clean/main.ts` | `deleteRefs` returns, per branch and side, whether the delete succeeded and git's error. It must not rely on a single batched command's exit code to decide which refs went away (a batched `git push --delete` or `git branch -D` can partly succeed); deleting one ref per command, or checking what still exists afterwards, are both acceptable. |
| 2 | same file | The handler builds `deletedBranches` and the summary from step 1 and returns failure when anything was not deleted. |

`commands/clean` owns this. No new shared util is needed.

## Testing strategy

| Level | Test | Covers |
| --- | --- | --- |
| Unit | `packages/apps/cli/src/commands/clean/unit.test.ts`: bare origin with a `pre-receive` hook refusing deletes, two pushed lump branches | Failure; message names both branches as origin failures; `ls-remote` still lists them. |
| Unit | same file: one lump branch checked out locally, another not | Failure naming the checked-out one as a local failure; the other is deleted locally and on origin. |
| Unit | same file: hook refusing deletes of only one of two branches | The other branch is gone from origin; only the refused one is named. |
| Unit | existing cases in the same file | Pass unchanged. |

## Acceptance criteria

1. Both repros above exit non-zero and name the branch that still exists.
2. `deletedBranches` never names a branch that still exists on the side `clean` tried to delete.
3. A successful `clean` prints the same message and `--json` envelope as today.
4. `npm run test -w=@lumpcode/cli` is green.
