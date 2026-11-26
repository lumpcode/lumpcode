# Learnings

## Expected
`desc.yml` (`directImpl`, no `dependsOn`): `folderBacklogContexts` warns when a `desc.yml` `name` differs from the folder basename, and still loads the item. It does not throw. The folder stays the path (`todoRelativeDir`, `BACKLOG_ITEM_DIR`). The desc name stays the context name. Duplicate desc names still throw. `abstractionBacklog` looks up `requirements.md` from the folder, not from the desc name. The schema description stops saying the name must match the folder. A mismatch log is one warning. This item has no `requirements.md`, `testPlan.md`, or `expect.yml`. No parent copy exists.

## Landed
Working tree only. No marker commit yet.

- `packages/recipes/src/kit/folderBacklogContexts/main.ts`: a basename mismatch logs one `console.warn` and the item is still returned. The context `name` stays the desc name. Duplicate desc names still throw.
- `packages/recipes/src/kit/folderBacklogContexts/unit.test.ts`: mismatch loads (including a ticket basename), one warning per mismatched item, and two folders that share a desc name still throw.
- `packages/recipes/src/recipes/abstractionBacklog/main.ts`: `requirements.md` is read from `todo/<todoRelativeDir>/`, the folder path.
- `packages/recipes/src/recipes/backlog/main.unit.test.ts`: `BACKLOG_ITEM_DIR` and `TASK_NAME` stay folder and desc name; `abstractionBacklog` uses the folder for `REQ_FILE` and ignores a requirements file that exists only under the desc name.
- `packages/recipes/src/recipes/featureBacklog/main.ts`: reading a parent `desc.yml` for `dependsOn` no longer throws when the parent name differs from the folder, so the ticket still loads. The mismatch warning stays the one from `folderBacklogContexts`.
- `packages/recipes/src/recipes/featureBacklog/resolve.ts`: umbrella ticket lookup, the campaign key, and completion `dependsOn` use `todoRelativeDir`. The completion context name stays the desc name.
- `packages/recipes/src/recipes/featureBacklog/main.unit.test.ts`: a mismatched item and a mismatched umbrella parent load with the folder path, the desc name as the context name, and one warning per mismatch.
- `packages/recipes/schemas/backlogDesc.schema.json` and `packages/recipes/schemas/featureBacklogDesc.schema.json`: the `name` description no longer says the name must match the folder.
- `packages/apps/cli/DOCS/author/backlog.md` and `packages/apps/cli/DOCS/author/recipes.md`: the same sentence. `BACKLOG_ITEM_DIR` is documented as the folder.
- `learnings.md` (this file).

`npm run test -w=@lumpcode/recipes` (116 tests) and `npm run build -w=@lumpcode/recipes` passed. `npm run build -w=@lumpcode/cli` and `npm run test -w=@lumpcode/cli` (1396 tests) passed.
