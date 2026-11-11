# Learnings

## Expected
`desc.yml`: `featureBacklog` tickets under `todo/<parent>/tickets/` only receive their own `dependsOn`, rewritten to sibling names, so a parent's `dependsOn` gates only the parent's completion. Every ticket context must also wait for the parent's `dependsOn`. Workflow is `impl` only. No `dependsOn`.

`requirements.md`: a ticket context's `dependsOnContexts` is the union of its own `dependsOn` rewritten to `${parent}-${dep}` and the parent's `dependsOn` left as parent-level item names, with duplicates removed. The parent's `completion` context stays the parent's `dependsOn` plus every ticket. `lump-plan --contexts` and `run` both use that context list. Read `todo/<parent>/desc.yml` once per parent per context-list build, with the kit's YAML load and `validateBaseBacklogItem`. A parent with no `dependsOn` changes nothing. Ticket `dependsOn` entries stay sibling names. Docs: the "Big features" paragraph in `packages/apps/cli/DOCS/author/recipes.md`. Tests in `featureBacklog/main.unit.test.ts` (testImpl and impl inheritance, parent without `dependsOn`, top-level unchanged, and a real-folder context list for the auth/persistence layout, including unchanged completion and a repeated inherited name). No `testPlan.md` or `expect.yml`.

## Landed
Impl stage. Working tree only. No marker commit yet.

- `packages/recipes/src/recipes/featureBacklog/resolve.ts` returns the parent's `dependsOn` on every ticket stage as `additionalDependsOnContexts`, dropping names the ticket already lists. The parent `desc.yml` is loaded with `js-yaml` and `validateBaseBacklogItem`, once per parent for a context-list build (and once per resolve call outside that build). `completion` is still the parent's `dependsOn` plus each ticket, with a name that appears in both kept once.
- `packages/recipes/src/recipes/featureBacklog/main.ts` scopes that parent-desc cache to one `getContextListFn` call.
- `packages/recipes/src/recipes/featureBacklog/main.unit.test.ts` covers testImpl and impl inheritance, a parent with no `dependsOn` (including `dependsOn: []`), an unchanged top-level item, invalid parent `desc.yml`, and the auth/persistence folder layout plus a ticket whose own dependency repeats an inherited name.
- `packages/apps/cli/DOCS/author/recipes.md` says a ticket waits for its parent's `dependsOn` as well as its own, and that its own `dependsOn` names sibling tickets.
- `.lumpcode/lumps/bugfixes/backlogItems/todo/child-tickets-inherit-parent-depends-on/learnings.md` (this file).

`npm run test -w=@lumpcode/recipes` passed (110 tests). `npm run build -w=@lumpcode/cli` and `npm run test -w=@lumpcode/cli` passed (1285 tests). No `expect.yml` line estimates to compare.
