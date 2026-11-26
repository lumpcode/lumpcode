# Requirements: Repo template for the four lanes

| Field | Value |
| --- | --- |
| **Backlog** | `repo-templates` · priority **10** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | This repo's `.lumpcode/` only. `@lumpcode/cli`, `@lumpcode/core`, `@lumpcode/recipes`, `@lumpcode/cli-utils`, and the website stay unchanged. |

## Problem statement and motivation

This repo tells other teams to keep agent, model, worktree preparation, and pull-request opening in `.lumpcode/templates/<name>.ts`, then wrap each lump in that factory. The install prompt already contains that factory. This repo has no `.lumpcode/templates/` directory. `backlog`, `qol`, `bugfixes`, and `docs` each repeat `command: 'cursor'`, `lumpVariables: { model: 'grok-4.7-high' }`, and `postTeardownWorkspaceFn: openPrPostTeardown({ provider: 'github' })`.

1. The four lanes are the configs a reader copies, and each one still inlines the shared settings.
2. The four lanes can drift on command, model, or the PR hook because each config owns its own copy.
3. A new worktree does not copy `.env` files and does not run `npm ci`. The install prompt's factory does both, and only after the CLI has created the worktree.
4. Later work (`repo-lumps-workflow`, then `setup` writing the same file) needs this template to exist first. `setup` leaves an existing `templates/main.ts` untouched.

## Goals

1. `.lumpcode/templates/main.ts` is the install prompt's Step 5 factory, with this repo's four constants filled in.
2. `backlog`, `qol`, `bugfixes`, and `docs` export that `defineLump` wrapped around the recipe they already call.
3. Resolved contexts, prompts, validation, concurrency, branches, command, model, and GitHub PR opening stay as they are today. `lump-plan` output for each of the four lumps matches the output from before the wrap.
4. `learningsPromptFns` stays on the feature lanes that already pass it. The template does not take prompts.
5. No CLI, recipe, website, or install-prompt change.

## Non-goals

- Editing `packages/apps/website/app/assets/install-prompt.md`. It stays the source text.
- `setup`, `lump-create --template`, or any other CLI behavior. `factory-templates` owns that, after 0.11.0.
- Rewriting these lumps as `workflow`. `repo-lumps-workflow` does that, and it depends on this item.
- Moving `writer`, `trimmer`, `polisher`, `ideasToBacklog`, `presetSmoke`, `bugHunter`, `autoTriage`, `abstractionFinder`, or `abstractionImplementer` onto the template. Those configs keep their own command, model, and `openPrPostTeardown`.
- Moving `learningsPromptFns`, the backlog lane's `expect.yml` hint, or the docs lane's prompt into the template.
- A second template file, a JavaScript twin, or a new root dependency. `@lumpcode/cli-utils` and `@lumpcode/recipes` are already root dependencies.
- Operator docs, the website, and `.agents/memory/domain/repo-lumps.md`. The memory note moves when `repo-lumps-workflow` lands.
- Changing `project.json`, `local.json`, or the worker's workspace strategy. The strategy stays in the worker clone's `.lumpcode/local.json`.

## User stories / use cases

1. As a maintainer of this repo, I have one `.lumpcode/templates/main.ts` so the four lanes share the Cursor command, `grok-4.7-high`, worktree preparation, and GitHub PR opening.
2. As an operator, `lumpcode lump-plan backlog` (and the same for `qol`, `bugfixes`, and `docs`) still lists the same contexts and prompts, with the same agent argv.
3. As a worker on the worktree strategy, each new worktree for those lanes receives copied `.env` files and then `npm ci`.
4. As a worker on the checkout strategy, that preparation hook returns without copying files and without an install command.
5. As the author of a later lump, I can pass `command`, `lumpVariables`, `postSetupWorkspaceFn`, or `postTeardownWorkspaceFn` and that value wins over the template default.

## Proposed behavior and UX

No new command, flag, or message. The operator-visible check is `lumpcode lump-plan <lumpName>` for `backlog`, `qol`, `bugfixes`, and `docs`, including `--contexts`, `--prompts`, and `--plan`.

### Template constants

The file is the fenced TypeScript block under "Step 5: Project and template" in `packages/apps/website/app/assets/install-prompt.md`, with one constant changed. `COMMAND`, `INSTALL_COMMAND`, and `OPEN_PR` already match that block.

| Constant | Value |
| --- | --- |
| `COMMAND` | `'cursor'` |
| `MODEL` | `'grok-4.7-high'` |
| `INSTALL_COMMAND` | `'npm ci'` |
| `OPEN_PR` | `true` |

`MODEL` in the published block is `'auto'`, the suggestion for a new Cursor repo. These four lanes already pass `grok-4.7-high`. That string is the one edit.

### `defineLump`

```ts
defineLump<V extends LumpVariables = LumpVariables, SV extends StepVariables = StepVariables>(
  config: LumpJsConfig<V, SV>,
): LumpJsConfig<V, SV>
```

Imported by each lane as `import { defineLump } from '../../templates/main'`. The function is the snippet's merge, in this order:

| Key | Result |
| --- | --- |
| `command` | `COMMAND`, then the caller config. A caller's `command` wins. |
| `lumpVariables` | `{ model: MODEL, ...config.lumpVariables }`. Caller keys win, including a different `model`. Other caller keys stay. |
| `postSetupWorkspaceFn` | Omitted when the caller set `postSetupWorkspaceCommand`. Otherwise the caller's `postSetupWorkspaceFn`, or `prepareWorktree` when the caller omitted it. |
| `postTeardownWorkspaceFn` | Omitted when the caller set `postTeardownWorkspaceCommand`. Otherwise the caller's `postTeardownWorkspaceFn`, or `openPrPostTeardown({ provider: 'github' })` when the caller omitted it. No `title`, `body`, or `lumpName`. |

The factory sets no `steps`, `prompt`, `workflow`, validation command, `registerCommands`, or `promptFns`. `defineConfig` from `@lumpcode/cli-utils` is the identity wrapper the snippet already calls. Calling it again around a recipe result does not drop fields.

### Worktree preparation

`prepareWorktree` is a `PostSetupWorkspaceFn`. When `workspaceStrategy` is anything other than `'worktree'`, it returns void. When the strategy is `'worktree'`:

1. `copyEnvFiles(projectRoot, workspacePath)` walks `projectRoot`. It does not descend into a directory named `node_modules`, `.git`, `.worktrees`, or `.lumpcode`. It copies a file whose name is `.env` or starts with `.env.` to the same relative path under `workspacePath`, creating parent directories. An existing destination stays as it is. The walk runs no git command.
2. The hook then returns `{ command: 'npm ci' }`.

`lump-plan` loads the config with post-workspace hooks skipped, so this hook never appears in `setupWorkspaceCommand`. That field stays the git workspace command.

### Lane configs

Each file keeps its recipe and its explicit type arguments, and becomes the default export of `defineLump(...)`.

| Lump | Export |
| --- | --- |
| `backlog`, `qol`, `bugfixes` | `defineLump(featureBacklog<CursorPresetLumpVariables, CursorPresetStepVariables>({ ... }))` |
| `docs` | `defineLump(backlog<BaseBacklogItem, CursorPresetLumpVariables, CursorPresetStepVariables>({ ... }))` |

Drop these from all four, and drop the `openPrPostTeardown` import:

- `command`
- `lumpVariables` (the only key today is `model`)
- `postTeardownWorkspaceFn`

Keep every other option on that config.

| Lump | Stays on the recipe options |
| --- | --- |
| `backlog` | `configUrl`, `registerCommands: ['cursor']`, `maximumNumberOfConcurrentBranches: 3`, `verbose`, `keepHistory`, `implValidateCommand` (`npm run build -w=@lumpcode/cli && npm run test -w=@lumpcode/cli`), `timeoutMillis` of 4 hours, `promptFns: learningsPromptFns(...)` with the existing `withExpectMatch` overrides for `testImpl` and `impl`. `existingExpectPath` and `withExpectMatch` stay in this file. Discovery options stay omitted, so the recipe keeps `dev` and `feature/*`. |
| `qol`, `bugfixes` | Same shape as `backlog`, with `maximumNumberOfConcurrentBranches: 2`, `learningsPromptFns()` and no stage overrides, and no `timeoutMillis`. |
| `docs` | `configUrl`, `baseBranch: 'dev'`, `discoveryBranch: 'dev'`, `registerCommands: ['cursor']`, `maximumNumberOfConcurrentBranches: 2`, `verbose`, `keepHistory`, `resolveItem` returning `{ stage: 'implementation' }`, and the existing `stages.implementation` prompt. This lane has no `learningsPromptFns` and no `implValidateCommand`. |

`learningsPromptFns` remains owned by `.lumpcode/helpers/learningsPromptFns.ts`. `backlog`, `qol`, and `bugfixes` keep importing it from `../../helpers/learningsPromptFns`. The template does not import it. The docs prompt text stays the string in `docs/config.ts`.

## Technical approach

Owner of command, model, env copy, `npm ci`, and GitHub PR opening for these four lanes: `.lumpcode/templates/main.ts`. The four configs call `defineLump` and do not restate those fields. Other lumps may still set them until `repo-lumps-workflow`. Owner of the learnings addendum: `.lumpcode/helpers/learningsPromptFns.ts`, called from the three feature-lane configs.

| Step | Where | What |
| --- | --- | --- |
| 1 | `.lumpcode/templates/main.ts` | Add the Step 5 block. Set `MODEL` to `'grok-4.7-high'`. Leave the merge, `copyEnvFiles`, and `prepareWorktree` as in that block. |
| 2 | `.lumpcode/tsconfig.json` | Add `templates/**/*.ts` next to `lumps/**/*.ts` and `helpers/**/*.ts`, so the template is part of the same program as the helpers. |
| 3 | `.lumpcode/lumps/{backlog,qol,bugfixes,docs}/config.ts` | Wrap the existing recipe call in `defineLump`. Remove the three duplicated fields and the unused `openPrPostTeardown` import. Leave the rows in the table above. |

No `package.json` edit. The template imports `defineConfig`, `LumpJsConfig`, `LumpVariables`, `PostSetupWorkspaceFn`, and `StepVariables` from `@lumpcode/cli-utils`, and `openPrPostTeardown` from `@lumpcode/recipes`, as the snippet does.

`.lumpcode/.gitignore` does not ignore `templates/`. The new file is committed with the lane edits.

## Acceptance criteria

1. `.lumpcode/templates/main.ts` matches the Step 5 fenced block except `MODEL`, which is `'grok-4.7-high'`. `COMMAND` is `'cursor'`, `INSTALL_COMMAND` is `'npm ci'`, and `OPEN_PR` is `true`.
2. `backlog`, `qol`, `bugfixes`, and `docs` default-export `defineLump` around the same recipe call as today. None of the four sets `command`, `lumpVariables`, or `postTeardownWorkspaceFn`, and none imports `openPrPostTeardown`.
3. `learningsPromptFns` is still passed by `backlog` (with the `expect.yml` hint on `testImpl` and `impl`), `qol`, and `bugfixes`. It is absent from the template and from `docs`. The docs implementation prompt is unchanged.
4. The fields in the "Stays on the recipe options" table are unchanged, including concurrency, validation commands, the backlog timeout, docs `baseBranch` / `discoveryBranch`, and omitted discovery options on the three `featureBacklog` lanes.
5. For each of the four lump names, `lumpcode lump-plan <name>`, `--contexts`, `--prompts`, and `--plan` match the pre-change output: context names, variables, options, prompt text, and agent argv (`cursor`, model `grok-4.7-high`). `--plan`'s `setupWorkspaceCommand` stays the git workspace command.
6. On a `'worktree'` run, the template hook copies `.env` and `.env.*` as specified and returns `{ command: 'npm ci' }`. On any other strategy it returns void. It never runs git and never overwrites an existing destination file.
7. After a push, the four lanes still open a GitHub PR through `openPrPostTeardown({ provider: 'github' })` supplied by the template.
8. A caller `command`, `lumpVariables` key, `postSetupWorkspaceFn`, or `postTeardownWorkspaceFn` replaces the template default. A caller `postSetupWorkspaceCommand` or `postTeardownWorkspaceCommand` keeps the template from also setting the matching function.
9. No file under `packages/`, `packages/apps/website/app/assets/install-prompt.md`, `.agents/`, or any other `.lumpcode/lumps/*/config.ts` changes. `desc.yml` for this item stays as it is.
