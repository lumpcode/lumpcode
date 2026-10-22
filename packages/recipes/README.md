# @lumpcode/recipes

Ready-made lumps and helpers for [Lumpcode](https://www.npmjs.com/package/@lumpcode/cli): retry until your checks pass, ticket backlogs as folders in git, find-then-implement refactor pipelines, and opening a GitHub PR after each push.

Install the CLI with `npm install -g @lumpcode/cli`. Add this package to your **project** (not globally) so a worker clone gets it from `npm install`:

```bash
npm install --save-dev @lumpcode/recipes @lumpcode/cli-utils
```

## Retry until green

Run your checks after the agent; on failure, hand it the output and try again. Only green work is committed and pushed.

```ts
// .lumpcode/lumps/typedExports/config.ts
import { defineConfig } from '@lumpcode/cli-utils'
import { retryUntilGreen, shellCommand } from '@lumpcode/recipes'

export default defineConfig({
  command: 'cursor',
  contextListJson: { FILE: 'src/utils/{NAME}.ts' },
  steps: retryUntilGreen({
    steps: [{ promptTemplate: 'Add an explicit return type to every export in @{FILE}.' }],
    validationCommandFn: () => shellCommand('npm run typecheck && npm test'),
  }),
})
```

## A ticket backlog

One folder per ticket under `backlogItems/todo/<name>/desc.yml`. Each stage is its own PR (requirements, tests, implementation), and finished items move to `completed/`.

```ts
// .lumpcode/lumps/backlog/config.ts
import { featureBacklog, openPrPostTeardown } from '@lumpcode/recipes'

export default featureBacklog({
  configUrl: import.meta.url,
  command: 'cursor',
  primaryDiscoveryBranch: 'main',
  implValidateCommand: 'npm run build && npm test',
  postTeardownWorkspaceFn: openPrPostTeardown({ provider: 'github' }),
})
```

```yaml
# .lumpcode/lumps/backlog/backlogItems/todo/export-csv/desc.yml
# yaml-language-server: $schema=https://lumpcode.com/schemas/featureBacklogDesc.schema.json
name: export-csv
task: Add a "Download CSV" button to the orders table.
priority: 1
workflow: [req, impl]
```

## What is in the box

| Recipe | Builds a lump that |
| --- | --- |
| `backlog` | works through a folder of tickets with stages you define |
| `featureBacklog` | takes each feature through requirements, tests, and implementation |
| `abstractionFinder` | files one refactor ticket per pass while the queue is under a cap |
| `abstractionBacklog` | implements those tickets with a validation loop |

| Helper | Does |
| --- | --- |
| `retryUntilGreen`, `getRecursiveSteps` | validation loops with retries |
| `requireArtifactStep` | fails a step until a file exists |
| `shellCommand` | `sh -c` command for validation steps |
| `openPrPostTeardown` | opens a GitHub PR with `gh` after push |
| `folderBacklogContexts`, `folderSetTaskDoneStep`, `listTodoRelativeDirs` | building blocks of the folder backlog |
| `ephemeralContextListFn` | fresh contexts every pass, for hunts and scans |
| `defaultReqPrompt`, `defaultImplPrompt`, … | the `featureBacklog` prompts, to wrap with `promptFns` |

Recipe factories need `configUrl: import.meta.url`. Every factory and helper keeps the `<V, SV>` generics of `defineConfig`, so typed preset options flow through.

## Docs

- [Recipes](https://www.lumpcode.com/docs/author/recipes): every option
- [Folder backlog](https://www.lumpcode.com/docs/author/backlog): step-by-step tutorial
- [Examples](https://www.lumpcode.com/docs/examples/overview): ticket backlogs, triage, find-then-implement, retries

## Development

From the monorepo root: `npm run build -w=@lumpcode/recipes` (after `core`, `cli-types`, `cli-utils`), then `npm run test -w=@lumpcode/recipes`.
