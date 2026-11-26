# Learnings

## Expected

`desc.yml` (`workflow: [req, impl]`, priority 10, no `dependsOn`) asks for `.lumpcode/templates/main.ts` written by hand from the install prompt's Step 5 snippet: Cursor command, the lanes' model, `copyEnvFiles` plus `npm ci` in `prepareWorktree`, and `openPrPostTeardown` on GitHub. `backlog`, `qol`, `bugfixes`, and `docs` move onto that `defineLump`. Their behavior stays as it is. `learningsPromptFns` stays in the lanes. `lump-plan` output for each lump matches before and after. No CLI change.

The req stage asked for a self-contained `requirements.md` (problem, goals, non-goals, user stories, behavior, technical approach, acceptance criteria). No testing strategy. `desc.yml` stays untouched. The feature itself was not implemented in that stage.

The impl stage follows that `requirements.md`. The template is the Step 5 block with `MODEL` set to `grok-4.7-high` (`COMMAND` `cursor`, `INSTALL_COMMAND` `npm ci`, `OPEN_PR` true). The four lane configs wrap their current recipe in `defineLump` and drop `command`, `lumpVariables`, and `postTeardownWorkspaceFn`. `.lumpcode/tsconfig.json` gains `templates/**/*.ts`. Contexts, prompts, validation, concurrency, branches, command, model, and GitHub PR opening stay. The worktree hook copies env files and returns `npm ci`. No package, install-prompt, memory, or other lump config change.

No `testPlan.md` or `expect.yml` on this item. It is a top-level backlog item, so there is no parent copy.

## Landed

Working tree only. No marker commit.

Req stage, still in the tree and unchanged in this stage:

- `.lumpcode/lumps/backlog/backlogItems/todo/repo-templates/requirements.md`
- `.lumpcode/lumps/backlog/backlogItems/todo/repo-templates/learnings.md` (this file)

Impl stage:

- `.lumpcode/templates/main.ts`: the Step 5 factory. `MODEL` is `grok-4.7-high`. `defineLump` merges command, model, `prepareWorktree`, and `openPrPostTeardown({ provider: 'github' })`.
- `.lumpcode/tsconfig.json`: `include` adds `templates/**/*.ts`.
- `.lumpcode/lumps/backlog/config.ts`, `qol/config.ts`, `bugfixes/config.ts`, and `docs/config.ts`: the default export is `defineLump` around the same recipe. Dropped `command`, `lumpVariables`, `postTeardownWorkspaceFn`, and the `openPrPostTeardown` import. `learningsPromptFns` stays on the three feature lanes, including the backlog `expect.yml` hint on `testImpl` and `impl`. Docs keeps its prompt, `baseBranch`, and `discoveryBranch`.
- `scripts/repo-template.unit.test.mjs`: factory behavior and the four lane sources.

`desc.yml` is unchanged.

## Gap

The Step 5 block does not typecheck under `.lumpcode/tsconfig.json` (`strict`). `INSTALL_COMMAND` is annotated `string`, and the `lumpVariables` spread uses `config.lumpVariables ?? {}` with casts, so `tsc -p .lumpcode/tsconfig.json` passes. Runtime matches the block: the same constants, merge order, env copy, and `{ command: 'npm ci' }`.

`scripts/repo-template.unit.test.mjs` is not in the requirements file list. The requirements forbid edits under `packages/`, and the scripts suite already covers `.lumpcode` helpers, so the test lives there.
