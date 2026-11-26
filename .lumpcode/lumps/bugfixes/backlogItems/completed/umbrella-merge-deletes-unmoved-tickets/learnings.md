# Learnings

## Expected
`desc.yml`: `folderSetTaskDoneStep` skips a destination directory that already exists (`completed/<parent>/tickets`) and then deletes the todo tree, so tickets and files that were never moved are removed. Workflow is `impl` only. No `dependsOn`.

`requirements.md`: `mergeTodoUmbrellaParentIntoCompleted` merges directories recursively. A missing destination is renamed into `completed/`. A directory that exists on both sides is merged, not skipped. A file that already exists is left unchanged, its todo copy stays, and the step warns with that source path and that the destination already exists. That warning does not take the non-merge path that returns null. The parent `desc.yml` is rewritten with `completedAt` and the source `desc.yml` is deleted. A source directory is removed once it is empty. `todo/<parent>/` is removed only after every other entry was moved; a kept conflict leaves the todo folder in place. An existing completed ticket is not overwritten. The empty-`tickets/` merge still stamps the parent and keeps `t1`. No second merge in `featureBacklog` or `backlog`. `@lumpcode/core`, `@lumpcode/cli`, and docs stay unchanged. This item has no `testPlan.md` or `expect.yml`. It is not a child ticket, so there is no parent copy.

## Landed
Working tree only. No marker commit yet.

- `packages/recipes/src/kit/folderSetTaskDoneStep/main.ts`: `mergeDirectoryContents` walks the todo tree. It renames a file or directory whose destination is missing, merges a directory that exists on both sides, and warns and keeps a source file whose destination already exists. Empty source directories are removed with `rmdir`. The stamped parent `desc.yml` is written first and the source `desc.yml` is then deleted. The todo parent is removed only when nothing was kept (−13/+43).
- `packages/recipes/src/kit/folderSetTaskDoneStep/unit.test.ts`: the repro moves `tickets/t2` beside an existing `t1`, keeps `requirements.md` and `t1`, and removes `todo/umbrella`. A `notes.md` that already exists under `completed/` is not overwritten, the warning names that source path, the todo copy stays, and `requirements.md` still moves (−0/+130). The empty-`tickets/` merge case is unchanged.
- `learnings.md` (this file).

No other module grew a merge. No `expect.yml` line estimates to compare.

`npx tsc -p packages/recipes/tsconfig.json --noEmit` passed. `npm run test -w=@lumpcode/recipes` passed (112 tests). `npm run build -w=@lumpcode/cli && npm run test -w=@lumpcode/cli` passed (178 files, 1400 tests) once this worktree’s `@lumpcode/*` packages resolved to its own `packages/`. Before that, Node walked up to the main checkout’s core, whose workflow types do not match this branch.
