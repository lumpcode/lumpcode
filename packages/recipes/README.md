# @lumpcode/recipes

Lumpcode **recipes** and **kit** helpers for authoring lump configs without boilerplate.

Private monorepo workspace for now (same rollout path as `@lumpcode/cli-utils`).

## Recipes

| Recipe | Export | Use when |
|--------|--------|----------|
| **backlog** | `backlog` | Generic folder backlog with a typed stage map and per-item stage resolution |
| **featureBacklog** | `featureBacklog` | Feature items with PRD → test plan → test implementation → implementation |
| **abstractionFinder** | `abstractionFinder` | Ephemeral contexts that scan for duplicated CLI utils and append one backlog item + PRD per run |
| **abstractionBacklog** | `abstractionBacklog` | Folder backlog items with PRDs — implement abstraction with verify-until-green, then move item to completed/ |

## Backlog layout

Each lump stores backlog items under `backlogItems/`:

```
.lumpcode/lumps/<lump>/backlogItems/
  todo/<name>/desc.yml
  todo/<name>/prd.md          # optional until makePrd / finder writes it
  todo/<name>/testPlan.md     # featureBacklog only; optional until makeTestPlan
  completed/<name>/desc.yml   # includes completedAt after move-to-done
  completed/<name>/prd.md     # moves with the folder
  completed/<name>/testPlan.md
```

`desc.yml` is a single YAML object with `name`, `task`, `priority`, optional `dependsOn`, and recipe-specific fields (e.g. `manualPrd` for featureBacklog).

## Kit

Flat helpers under `src/kit/` (re-exported from the package root):

- `backlog` recipe helpers — `resolveBacklogPaths`, `validateBaseBacklogItem`, `requireArtifactStep`, `projectRootFromConfigUrl`
- `getRecursiveSteps` — agent step(s) + validation command, retry until pass
- `retryUntilGreen` — opinionated wrapper over `getRecursiveSteps` with default fix prompt
- `ephemeralContextListFn` — N fresh synthetic contexts per run (`contextCount`, index-aware names)
- `folderBacklogContexts` — `getContextListFn` from `backlogItems/todo/` with optional per-item parsing
- `folderSetTaskDoneStep` — move finished item folder from `todo/` to `completed/` after a context completes
- `ymlBacklogContexts` / `setTaskDoneStep` — **deprecated** YAML-list helpers (warn once, still work)
- `resolveImplValidateCommand` — string, descriptor, or fn → `ValidationCommandFn`
- `shellCommand` — `sh -c` helper for validation commands

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
import { LumpJsConfig } from '@lumpcode/cli-types';
import { featureBacklog } from '@lumpcode/recipes';

export default {
    ...featureBacklog({
        baseBranch: 'dev',
        command: 'cursor',
        configUrl: import.meta.url,
        registerCommands: ['cursor'],
        maximumNumberOfConcurrentBranches: 5,
        verbose: true,
        keepHistory: true,
        lumpVariables: { model: 'composer-2.5' },
        discoveryBranch: 'dev',
        implValidateCommand: [
            'npm run build -w=@lumpcode/cli',
            'npm run test -w=@lumpcode/cli',
        ].join(' && '),
    }),
} satisfies LumpJsConfig;
```

### abstractionFinder + abstractionBacklog

Two-lump pipeline: finder tops up the implementer backlog; implementer runs items that already have PRDs.

```ts
// .lumpcode/lumps/abstractionFinder/config.ts
import { LumpJsConfig } from '@lumpcode/cli-types';
import { abstractionFinder } from '@lumpcode/recipes';

export default {
    ...abstractionFinder({
        maxPendingAbstractions: 5,
        scanDirectories: ['packages/apps/cli'],
        backlogItemsDir: '.lumpcode/lumps/abstractionImplementer/backlogItems',
        command: 'cursor',
        lumpVariables: { model: 'composer-2.5' },
        discoveryBranch: 'dev',
    }),
} satisfies LumpJsConfig;
```

```ts
// .lumpcode/lumps/abstractionImplementer/config.ts
import { LumpJsConfig } from '@lumpcode/cli-types';
import { abstractionBacklog } from '@lumpcode/recipes';

export default {
    ...abstractionBacklog({
        baseBranch: 'dev',
        command: 'cursor',
        configUrl: import.meta.url,
        registerCommands: ['cursor'],
        maximumNumberOfConcurrentBranches: 3,
        verbose: true,
        keepHistory: true,
        lumpVariables: { model: 'composer-2.5' },
        discoveryBranch: 'dev',
    }),
} satisfies LumpJsConfig;
```

### Custom config with kit helpers

```ts
import { defineConfig } from '@lumpcode/cli-types';
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
