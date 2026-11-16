# Say which context variables folderSetTaskDoneStep needs to find the item

`folderSetTaskDoneStep` (`packages/recipes/src/kit/folderSetTaskDoneStep/main.ts`) moves a finished backlog item from `todo/` to `completed/`. It needs two things from the context: the items directory, read from the variable the caller names in `itemsDirVarName` (the `backlog` recipe uses `BACKLOG_ITEMS_DIR`), and the item, read from either `BACKLOG_ITEM_DIR` or the `nameVarName` variable (default `TASK_NAME`). When any of these was missing, the step threw:

```
Backlog items directory and task name are required
```

That message did not name a variable or the context. It also said "task name" was required, when `BACKLOG_ITEM_DIR` alone is enough. The step has `continueOnError: true`, so the item quietly stays in `todo/` and this line in the history is the only clue. The message now uses the same form as `requireArtifactStep`, naming the context and the variables to set:

```
folderSetTaskDoneStep: context "alpha" must set BACKLOG_ITEMS_DIR to the backlog items directory and either BACKLOG_ITEM_DIR or TASK_NAME to the item to move.
```

Both variable names come from the step's own options, so a custom `itemsDirVarName` or `nameVarName` shows up as configured. The condition and when the step throws are unchanged; only the text changed. No docs or memory quoted the old string.

Tests: `folderSetTaskDoneStep/unit.test.ts` adds a case where a context sets only `BACKLOG_ITEMS_DIR`, and it expects the full new message.

Checks: `npm run test -w=@lumpcode/recipes` (9 files, 107 tests pass) and root `npm run build` (passes).

Follow-up for the trimmer lump: `packages/apps/cli/src/utils/formatDeamonLumpScopeCliOutput` has no callers outside its own test.
