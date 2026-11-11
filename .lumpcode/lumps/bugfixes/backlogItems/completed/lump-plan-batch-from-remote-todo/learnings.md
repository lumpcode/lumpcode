# Learnings

## Expected

`desc.yml` asks `lump-plan --plan` to take its next batch and branch from the same remote todo list `run` uses, with or without `--todoOnly`.

`requirements.md` says `planLumpFromJsConfig` computes that list once (`--todoOnly` or depth `plan`) and slices it the way `runLump` does. `--todoOnly` still only filters the printed contexts and prompts. An empty batch keeps `plan: { contextNames: [], branchName: '' }` and human output says `plan: no todo contexts`. Docs: the `--plan` and `--todoOnly` rows in `packages/apps/cli/DOCS/reference/commands.md`. Tests live in `planLumpFromJsConfig/unit.test.ts` and `lump-plan/unit.test.ts`. Core and recipes stay unchanged. `npm run build -w=@lumpcode/cli && npm run test -w=@lumpcode/cli` is green.

This item has no `testPlan.md` or `expect.yml`.

## Landed

No marker commit yet. Working tree:

- `packages/apps/cli/src/utils/planLumpFromJsConfig/main.ts` — one `getToDoContextList` read for the list filter and the plan batch. The batch is that list, narrowed to `--contextName` when set, then the first `numberOfContextsPerBranch`. `todoContextNames` is set whenever that read runs.
- `packages/apps/cli/src/commands/lump-plan/main.ts` — an unskipped empty batch prints `plan: no todo contexts`. The `todoOnly filter` line prints only when `--todoOnly` is set.
- `packages/apps/cli/DOCS/reference/commands.md` — `--plan` is the branch and batch `run` would pick next; `--todoOnly` filters the listed contexts and prompts.
- `packages/apps/cli/src/utils/planLumpFromJsConfig/unit.test.ts` — finished-context batch, empty batch, finished `--contextName`, and unfiltered contexts.
- `packages/apps/cli/src/commands/lump-plan/unit.test.ts` — human `plan: no todo contexts`, and `--plan` sets `todoContextNames` without the filter line.

`npm run build -w=@lumpcode/cli && npm run test -w=@lumpcode/cli` passed (1279 tests).

## Gap

None. The missing `createAndPushLumpBranch`, `LUMP_BRANCH_PREFIX`, and `execGit` names were already repaired on `dev`, so this change does not touch those test files.
