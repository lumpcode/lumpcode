# Learnings

## Expected

`desc.yml` (`workflow: [req, impl]`, priority 10, no `dependsOn`) asks for `.lumpcode/templates/main.ts` written by hand from the install prompt's Step 5 snippet: Cursor command, the lanes' model, `copyEnvFiles` plus `npm ci` in `prepareWorktree`, and `openPrPostTeardown` on GitHub. `backlog`, `qol`, `bugfixes`, and `docs` move onto that `defineLump`. Their behavior stays as it is. `learningsPromptFns` stays in the lanes. `lump-plan` output for each lump matches before and after. No CLI change.

This req stage asked for a self-contained requirements document at this item's `requirements.md`, covering problem, goals, non-goals, user stories, behavior, technical approach, and acceptance criteria. No testing strategy. `desc.yml` stays untouched. The feature itself is not implemented in this stage.

No `testPlan.md` or `expect.yml` on this item. It is a top-level backlog item, so there is no parent copy.

## Landed

Working tree only. No marker commit yet.

- `.lumpcode/lumps/backlog/backlogItems/todo/repo-templates/requirements.md`: the decided plan. The template is the Step 5 block with `MODEL` set to `grok-4.7-high` (`COMMAND` `cursor`, `INSTALL_COMMAND` `npm ci`, `OPEN_PR` true). The four lane configs wrap their current recipe in `defineLump` and drop `command`, `lumpVariables`, and `postTeardownWorkspaceFn`. Contexts, prompts, validation, concurrency, branches, command, model, and GitHub PR opening stay. The new worktree hook copies env files and returns `npm ci`. `lump-plan` skips that hook, so its output stays the same. `learningsPromptFns` stays on `backlog`, `qol`, and `bugfixes`. Docs keeps its own prompt. No package, install-prompt, or other lump config change. `.lumpcode/tsconfig.json` gains `templates/**/*.ts`.
- `.lumpcode/lumps/backlog/backlogItems/todo/repo-templates/learnings.md` (this file).

`desc.yml` is unchanged.
