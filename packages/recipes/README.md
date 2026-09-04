# @lumpcode/recipes

Lumpcode **recipes** and **kit** helpers for authoring lump configs without boilerplate.

Install [`@lumpcode/cli`](https://www.npmjs.com/package/@lumpcode/cli) for the Lumpcode CLI. Add this package when you want the recipes and kit helpers. Built on [`@lumpcode/cli-utils`](https://www.npmjs.com/package/@lumpcode/cli-utils) and [`@lumpcode/core`](https://www.npmjs.com/package/@lumpcode/core).

## Install

```bash
npm install @lumpcode/recipes
```

## Recipes

| Recipe | Export | Use when |
|--------|--------|----------|
| **backlog** | `backlog` | Generic folder backlog with a typed stage map and per-item stage resolution |
| **featureBacklog** | `featureBacklog` | Folder feature campaign: TDD stages, optional `directImpl`, tickets, and `dev` / `feature/*` discovery |
| **abstractionFinder** | `abstractionFinder` | One ephemeral context per tick that appends a backlog item + requirements doc while `todo/` is under `maxPendingAbstractions` |
| **abstractionBacklog** | `abstractionBacklog` | Folder backlog items with requirements — implement abstraction with verify-until-green, then move item to completed/ |

Recipe factories and variable-carrying kit helpers accept the same dual generics as `defineConfig` from `@lumpcode/cli-utils`: `<V extends LumpVariables, SV extends StepVariables>`, with defaults equal to the unbound bags. Pass explicit type args when refining preset contracts; omit them for classic untyped configs.

## Backlog layout

The backlog recipes (`backlog`, `featureBacklog`, `abstractionBacklog`) use a folder backlog under `backlogItems/`:

```
.lumpcode/lumps/<lump>/backlogItems/
  todo/<name>/desc.yml
  todo/<name>/requirements.md # optional until makeReq / finder writes it
  todo/<name>/testPlan.md     # featureBacklog TDD; optional until makeTestPlan
  todo/<parent>/tickets/<ticket>/desc.yml  # featureBacklog: parent skipped when tickets/ is non-empty
  completed/<name>/desc.yml   # includes completedAt after move-to-done
  completed/<name>/requirements.md # moves with the folder
  completed/<name>/testPlan.md
```

`desc.yml` is a single YAML object with `name`, `task`, `priority`, optional `dependsOn`, and recipe-specific fields (`manualReq`, `workflow` for featureBacklog).

## Kit

Flat helpers under `src/kit/` (re-exported from the package root):

- `backlog` recipe helpers — `resolveBacklogPaths`, `validateBaseBacklogItem`, `requireArtifactStep` (artifact `ValidationCommandFn`), `projectRootFromConfigUrl`
- `getRecursiveSteps` — agent step(s) + validation command, retry until pass (retries via `postCommandExecFn` returned steps)
- `retryUntilGreen` — opinionated wrapper over `getRecursiveSteps` with default fix prompt
- `ephemeralContextListFn` — N fresh synthetic contexts per run (`contextCount`, index-aware names)
- `folderBacklogContexts` — `getContextListFn` from `backlogItems/todo/` with optional per-item parsing (`listTodoRelativeDirs` lists todo-relative item folders, including tickets)
- `folderSetTaskDoneStep` — move finished item folder from `todo/` to `completed/` after a context completes
- `ymlBacklogContexts` / `setTaskDoneStep` — **deprecated** YAML-list helpers (warn once, still work)
- `resolveImplValidateCommand` — string, descriptor, or fn → `ValidationCommandFn`
- `shellCommand` — `sh -c` helper for validation commands
- `openPrPostTeardown` — `postTeardownWorkspaceFn` that opens a PR from `branchName` into resolved `baseBranch`. Pass `{ provider: 'github' }` (`gh` on PATH). Skips when the branch was not pushed or a PR already exists; create failures are logged and do not fail the run.

```ts
import { featureBacklog, openPrPostTeardown } from '@lumpcode/recipes';

export default featureBacklog({
  configUrl: import.meta.url,
  postTeardownWorkspaceFn: openPrPostTeardown({ provider: 'github' }),
});
```

## Generic backlog stage map

Consumers declare every legal stage key and how each stage completes:

```ts
import { backlog } from '@lumpcode/recipes';

export default backlog({
  configUrl: import.meta.url,
  stages: {
    draft: { steps: [{ promptTemplate: 'Draft docs.' }], completion: 'keepPending' },
    ship: { steps: [{ promptTemplate: 'Ship it.' }], completion: 'moveToDone' },
  },
  resolveItem({ item }) {
    return item.task.includes('draft')
      ? { stage: 'draft' }
      : { stage: 'ship' };
  },
});
```

`resolveItem` returns `{ stage, contextName?, variables?, additionalDependsOnContexts? }` or `{ ignored: true }`. Terminal stages with `completion: 'moveToDone'` append `folderSetTaskDoneStep`.

Context variables injected by `backlog`: `TASK_NAME`, `TASK`, `BACKLOG_ITEMS_DIR`, `BACKLOG_ITEM_DIR`, `BACKLOG_STAGE`.

## Examples

### featureBacklog

```ts
// .lumpcode/lumps/backlog/config.ts
import {
    type CursorPresetLumpVariables,
    type CursorPresetStepVariables,
} from '@lumpcode/cli-utils';
import { featureBacklog } from '@lumpcode/recipes';

export default featureBacklog<
    CursorPresetLumpVariables,
    CursorPresetStepVariables
>({
    command: 'cursor',
    configUrl: import.meta.url,
    registerCommands: ['cursor'],
    maximumNumberOfConcurrentBranches: 1,
    verbose: true,
    keepHistory: true,
    lumpVariables: { model: 'composer-2.5' },
    discoveryBranches: ['dev', 'feature/*'],
    implValidateCommand: [
        'npm run build -w=@lumpcode/cli',
        'npm run test -w=@lumpcode/cli',
    ].join(' && '),
});
```

`desc.yml` `workflow`: omit ≡ `tdd` (`makeReq` → `makeTestPlan` → `testImpl` → `implementation`); `directImpl` skips the test-plan stages; `manual` is ignored. On `dev` only top-level `directImpl` items run (tickets never run on `dev`, even if `directImpl`); on `feature/<key>` the matching item (or parent, for tickets). Ticket context names are `<parent>-<ticket>`; omit `manualReq` ≡ wait for a human `requirements.md`; `manualReq: false` opts into agent `makeReq`. Status reads use the concrete `discoveryBranch`.

### abstractionFinder + abstractionBacklog

Two-lump pipeline: finder tops up the implementer backlog; implementer runs items that already have requirements documents.

```ts
// .lumpcode/lumps/abstractionFinder/config.ts
import {
    type CursorPresetLumpVariables,
    type CursorPresetStepVariables,
} from '@lumpcode/cli-utils';
import { abstractionFinder } from '@lumpcode/recipes';

export default abstractionFinder<
    CursorPresetLumpVariables,
    CursorPresetStepVariables
>({
    configUrl: import.meta.url,
    maxPendingAbstractions: 5,
    scanDirectories: ['src'],
    backlogItemsDir: '.lumpcode/lumps/abstractionImplementer/backlogItems',
    command: 'cursor',
    lumpVariables: { model: 'composer-2.5' },
    discoveryBranch: 'dev',
    scanCommand: 'npx fallow dupes --mode semantic --format json > .lumpcode/dupes.json',
});
```

`maxPendingAbstractions` caps unmerged `todo/` items (one finder context per tick while under the cap). `scanCommand` runs before the default prompt. Pass `steps` to replace the prompt (the scanner still prepends). `configUrl: import.meta.url` is required so the recipe can count pending items from the project root.

```ts
// .lumpcode/lumps/abstractionImplementer/config.ts
import {
    type CursorPresetLumpVariables,
    type CursorPresetStepVariables,
} from '@lumpcode/cli-utils';
import { abstractionBacklog } from '@lumpcode/recipes';

export default abstractionBacklog<
    CursorPresetLumpVariables,
    CursorPresetStepVariables
>({
    baseBranch: 'dev',
    command: 'cursor',
    configUrl: import.meta.url,
    registerCommands: ['cursor'],
    maximumNumberOfConcurrentBranches: 3,
    verbose: true,
    keepHistory: true,
    lumpVariables: { model: 'composer-2.5' },
    discoveryBranch: 'dev',
});
```

### Custom config with kit helpers

```ts
import { defineConfig } from '@lumpcode/cli-utils';
import { retryUntilGreen, shellCommand } from '@lumpcode/recipes';

export default defineConfig({
    command: 'cursor',
    steps: retryUntilGreen({
        steps: [{ promptTemplate: 'Refactor duplicated helpers in src/.' }],
        validationCommandFn: () => shellCommand('npm test && npm run build'),
    }),
});
```

## Build

From the monorepo root:

```bash
npm run build -w=@lumpcode/core
npm run build -w=@lumpcode/cli-types
npm run build -w=@lumpcode/cli-utils
npm run build -w=@lumpcode/recipes
```

## Test

```bash
npm run test -w=@lumpcode/recipes
```
