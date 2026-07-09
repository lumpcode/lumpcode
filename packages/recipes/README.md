# @lumpcode/recipes

Lumpcode **recipes** and **kit** helpers for authoring lump configs without boilerplate.

Private monorepo workspace for now (same rollout path as `@lumpcode/cli-utils`).

## Recipes

| Recipe | Export | Use when |
|--------|--------|----------|
| **ephemeralContextLump** | `ephemeralContextLump` | N ephemeral synthetic contexts per tick, verify until green per context |
| **soloTask** | `soloTask` | One ephemeral context per run (`ephemeralContextLump` with N = 1) |
| **backlog** | `backlog` | YAML backlog with prd → testPlan → tests_impl → impl phases |
| **sweep** | `sweep` | Migration or doc sweep over many contexts (list template or file matcher) |

## Plugins

| Plugin | Export | Use when |
|--------|--------|----------|
| **verifyLoopPlugin** | `verifyLoopPlugin` | Wrap existing `config.steps` in verify-until-green (`fixSteps` on retry) |

```ts
import { defineConfig } from '@lumpcode/cli-types';
import { verifyLoopPlugin } from '@lumpcode/recipes';

const base = defineConfig({
  command: 'cursor',
  steps: [{ promptTemplate: 'Refactor duplicated helpers in src/.' }],
});

export default verifyLoopPlugin(base, {
  validateCommand: 'npm test && npm run build',
});
```

## Kit

- `getRecursiveSteps` — agent step + validation command, retry until pass
- `ephemeralContextListFn` — N fresh synthetic contexts per run (`contextCount`, index-aware names)
- `shellCommand` — `sh -c` helper for validation commands
- `makeBacklogContextListFn`, `loadPendingBacklogContexts`, `setTaskDoneStep` — backlog YAML plumbing

## Examples

### ephemeralContextLump / soloTask

```ts
import { soloTask } from '@lumpcode/recipes';

export default soloTask({
  command: 'cursor',
  prompt: 'Refactor duplicated helpers in src/ into a shared util with tests.',
  validateCommand: 'npm test && npm run build',
  discoveryBranch: 'dev',
  keepHistory: true,
});
```

For N > 1 ephemeral contexts on one branch/PR, use `ephemeralContextLump` with `contextCount` (and `maxContextCount` when `contextCount` is a function).

### backlog

```ts
import { backlog } from '@lumpcode/recipes';

export default {
  ...backlog({
    lumpName: 'backlog',
    baseBranch: 'dev',
  }),
  discoveryBranch: 'dev',
};
```

Requires `.lumpcode/lumps/<lumpName>/BACKLOG.yml` and `DONE.yml`.

### sweep

```ts
import { sweep } from '@lumpcode/recipes';

export default sweep({
  command: 'copilot',
  contextListJson: {
    PKG_FOLDER: 'packages/{PKG}/',
    PKG_JSON: 'packages/{PKG}/package.json',
    PKG_ENTRY: 'packages/{PKG}/src/index.ts',
  },
  steps: [
    'Read @{PKG_JSON} and @{PKG_ENTRY}. Write or rewrite packages/{PKG}/README.md (install, quick example, top exports).',
  ],
  maximumNumberOfConcurrentBranches: 5,
});
```

With `contextMatchFn` for file-driven codemods; add `validateCommand` with `prompt` for verify-until-green sweeps.

## Build

From the monorepo root:

```bash
npm run build -w=@lumpcode/core
npm run build -w=@lumpcode/cli-types
npm run build -w=@lumpcode/cli-utils
npm run build -w=@lumpcode/recipes
```
