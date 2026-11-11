# Learnings

## Expected
`desc.yml`: `lumpcode clean` ignores `git push --delete origin` and `git branch -D`, exits 0, and lists branches in `deletedBranches` that are still on origin or still local. Report only branches that were actually deleted, and fail when any deletion failed. Workflow is `impl` only. No `dependsOn`.

`requirements.md`: `deletedBranches` and `Cleaned N branch(es)` count a branch only when every copy `clean` targeted is gone. A remote or local failure exits non-zero, names that branch, the side (origin or local), and git's error, and does not stop the other deletes. Success output stays the same. One ref per command (a batched delete can partly succeed). No new flags, no change to discovery, worktree removal, or docs. Tests in `commands/clean/unit.test.ts`: a `pre-receive` hook refusing both deletes; one branch checked out locally; a hook refusing only one of two. No `testPlan.md` or `expect.yml`. The parent lump has none either.

## Landed
Working tree only. No marker commit yet.

- `packages/apps/cli/src/commands/clean/main.ts`: `deleteRefs` deletes one origin ref and one local branch per command and returns each side's result plus trimmed git stderr. `deletedBranches` keeps a branch only when every targeted side succeeded. Any failure returns that list, one `Could not delete origin|local branch "..."` line per failed side, and `Cleaned N branch(es); M could not be deleted.`
- `packages/apps/cli/src/commands/clean/unit.test.ts`: the three failure cases above. Successful cleans still say `Cleaned N branch(es)`.
- `packages/apps/cli/src/utils/countOpenLumpBranches/unit.test.ts`, `packages/apps/cli/src/utils/planLumpFromJsConfig/unit.test.ts`, `packages/apps/cli/src/utils/runLumpFromJsConfig/unit.test.ts`: call sites that still named `createAndPushLumpBranch`, or used `execGit` / `LUMP_BRANCH_PREFIX` without importing them, now use `createLumpWorkBranch` and those imports.
- `learnings.md` (this file).

`npm run test -w=@lumpcode/cli` passed (1276 tests) after `npm run build:bundle -w=@lumpcode/cli`, the same order CI uses.

## Gap
The requirements name only `commands/clean`. The suite was already red on missing test identifiers from the `createLumpWorkBranch` rename. Those three test files were updated so the suite could pass. `clean`'s behavior matches the requirements.
