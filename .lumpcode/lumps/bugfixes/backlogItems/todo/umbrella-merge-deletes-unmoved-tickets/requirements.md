# Requirements: umbrella merge deletes tickets that were not moved

| Field | Value |
| --- | --- |
| **Backlog** | `umbrella-merge-deletes-unmoved-tickets` · priority **20** · type **fix** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary `@lumpcode/recipes` (`kit/folderSetTaskDoneStep`). `@lumpcode/core`, `@lumpcode/cli`, and docs unchanged. |

## Problem statement and motivation

When an umbrella parent is finished, `folderSetTaskDoneStep` merges `todo/<parent>/` into an existing `completed/<parent>/` instead of renaming the whole folder. The merge in [`packages/recipes/src/kit/folderSetTaskDoneStep/main.ts`](../../../../../../packages/recipes/src/kit/folderSetTaskDoneStep/main.ts) (`mergeTodoUmbrellaParentIntoCompleted`) skips any destination entry that already exists, then `fs.rm`s the entire todo folder.

`completed/<parent>/tickets` already exists whenever this merge runs, because that is why the merge path was taken. The whole `todo/<parent>/tickets` tree is therefore skipped and then deleted. Tickets that were not already under `completed/` are gone.

1. A ticket whose move did not happen (the step is `continueOnError: true`) is deleted when the parent later completes.
2. Any other file that still lives under `todo/<parent>/tickets/` is deleted with it.
3. The existing unit test only puts an empty `tickets/` directory in todo, so the deletion is invisible.

### Repro (run during bug hunt, Vitest, temp directory under `os.tmpdir()`)

Call `folderSetTaskDoneStep({ itemsDirVarName: 'BACKLOG_ITEMS_DIR' }).commandFn` with `BACKLOG_ITEM_DIR` pointing at `todo/umbrella`.

| Path before the call | Contents |
| --- | --- |
| `todo/umbrella/desc.yml` | `name: umbrella` |
| `todo/umbrella/requirements.md` | a requirements file |
| `todo/umbrella/tickets/t2/desc.yml` | `name: t2` |
| `completed/umbrella/tickets/t1/desc.yml` | already completed |

| | Result |
| --- | --- |
| **Actual** | `todo/umbrella` is gone. `completed/umbrella/desc.yml`, `requirements.md`, and `tickets/t1/desc.yml` exist. `tickets/t2` does not exist under `completed/` or `todo/`. |
| **Expected** | `t2` is at `completed/umbrella/tickets/t2/desc.yml` next to `t1`. `requirements.md` and the stamped parent `desc.yml` are under `completed/umbrella/`. `t1` is unchanged. `todo/umbrella` is gone only after those entries have been moved. |

## Goals

1. Finishing an umbrella parent keeps every todo ticket and file by moving it to the same relative path under `completed/`.
2. A ticket that is already under `completed/` is left as it is.
3. The todo parent is removed only after its remaining entries have been moved.

## Non-goals

- When `completed/<parent>/` exists and it has no ticket directories, keep today's warning and leave the todo folder in place.
- Overwriting a completed ticket's `desc.yml`, or rewriting a file that already exists at the destination.
- Changing `continueOnError`, `completedAt`, or which contexts call this step.
- `featureBacklog` completion ordering. This fix is the move itself.

## User stories / use cases

1. As an operator finishing an umbrella item, I move the parent into `completed/` and still have every ticket folder that had not been moved yet.
2. As the author of a recipe that calls `folderSetTaskDoneStep`, I rely on one merge implementation and do not reimplement the directory walk.

## Proposed behavior and UX

`folderSetTaskDoneStep` stays the only mover. Callers pass `BACKLOG_ITEMS_DIR` and `BACKLOG_ITEM_DIR` as they do today.

When the destination is an existing umbrella completion (`completed/<parent>/` already contains ticket directories):

| Source entry | Destination | Result |
| --- | --- | --- |
| `desc.yml` | `completed/<parent>/desc.yml` | Rewritten with `completedAt`, as today. The source `desc.yml` is then deleted because that write replaced it. |
| File or directory whose destination path is missing | same relative path | Renamed into `completed/`. |
| Directory that exists on both sides (`tickets/`) | that directory | Children are merged with these same rules. The source directory is not skipped as a whole. |
| File that already exists at the destination | that file | Left unchanged. The source file is not deleted. The step warns, naming that source path and that the destination already exists. This does not take the non-merge path that returns null and leaves the whole todo folder unmerged. |
| Source directory with nothing left in it | none | Removed. |
| `todo/<parent>/` | none | Removed when the only leftover was its `desc.yml` and every other entry was moved. If a conflicting file was kept, the todo folder stays and the warning names that file. |

No second merge implementation in `featureBacklog` or `backlog`.

## Technical approach

| Step | Where | What |
| --- | --- | --- |
| 1 | `packages/recipes/src/kit/folderSetTaskDoneStep/main.ts` | `mergeTodoUmbrellaParentIntoCompleted` merges directories recursively. It deletes a source path only after that path has been moved, or when a source directory no longer contains entries. A pre-existing destination file is not overwritten and is not deleted from todo. |

Owner: `folderSetTaskDoneStep`. Recipe stages keep appending this step and do not walk `tickets/` themselves.

## Testing strategy

| Level | Where | Proves |
| --- | --- | --- |
| Unit | `packages/recipes/src/kit/folderSetTaskDoneStep/unit.test.ts` | The repro above: `t2` lands beside `t1`, `requirements.md` is kept, `t1` is unchanged, and `todo/umbrella` is removed. A file that already exists at the destination is not overwritten, a warning is emitted, and the source file is still on disk. The current empty-`tickets/` merge case still stamps the parent and keeps `t1`. |

## Acceptance criteria

1. The repro leaves `completed/umbrella/tickets/t2/desc.yml` in place, with `t1` and `requirements.md` still present.
2. `todo/umbrella` is absent when every non-`desc.yml` entry was moved.
3. A destination file that already exists is not overwritten, and its todo copy is not deleted.
4. No other module grows a second umbrella merge.
