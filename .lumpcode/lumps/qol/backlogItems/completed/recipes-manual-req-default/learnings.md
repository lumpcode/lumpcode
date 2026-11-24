# Learnings

## Expected
`desc.yml` (`directImpl`, no `dependsOn`): when a `featureBacklog` item omits `workflow`, the default is `[manualReq, testImpl, impl]`. This item has no `requirements.md`, `testPlan.md`, or `expect.yml`. No parent copy exists.

## Landed
Working tree only. No marker commit yet.

- `packages/recipes/src/recipes/featureBacklog/types.ts` (−2/+2): `DEFAULT_FEATURE_BACKLOG_WORKFLOW` is `['manualReq', 'testImpl', 'impl']`. Omitted workflow, a ticket whose parent omits it, and a missing parent `desc.yml` already resolve through that constant.
- `packages/recipes/src/recipes/featureBacklog/main.unit.test.ts` (−32/+74): an omitted workflow waits while `requirements.md` is missing, then runs `testImpl` and `impl`. The same default applies when a ticket's parent omits `workflow` or the parent `desc.yml` is missing. Explicit `req` / `testPlan` / `testImpl` routing stays covered on its own.
- `packages/recipes/schemas/featureBacklogDesc.schema.json` (−2/+2): the `workflow` description and first example state the new default.
- `packages/apps/cli/DOCS/author/recipes.md` (−1/+1) and `packages/apps/cli/DOCS/examples/backlogs.md` (−1/+1): the omitted-workflow sentence matches the new default.
- `.agents/skills/ideas-to-backlog/SKILL.md` (−1/+1) and `.agents/skills/write-tickets/SKILL.md` (−1/+1): the omit / default sentence matches.
- `.agents/memory/domain/recipes.md` (−1/+1): the `featureBacklog` omit clause matches.
- `learnings.md` (this file).

`npm run test -w=@lumpcode/recipes` (110 tests) passed. `npm run build -w=@lumpcode/cli` and `npm run test -w=@lumpcode/cli` (1367 tests) passed.
