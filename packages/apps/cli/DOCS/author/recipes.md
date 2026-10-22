# Recipes

`@lumpcode/recipes` packages the loops you would otherwise write by hand: retry until green, folder backlogs, finder and implementer pairs, and opening a GitHub PR after push. Optional; the CLI runs without it.

Install when you want the factories and kit, in the **project** so a worker clone sees them after `npm install`:

```bash
npm install @lumpcode/recipes
```

The CLI binary does not bundle this package. A TypeScript lump that imports it will fail on a dedicated clone that never ran `npm install`.

## Kit you will actually reach for

| Helper | Use when |
| --- | --- |
| `retryUntilGreen` | Agent edits, then your test/build command, retry with the failure output. |
| `getRecursiveSteps` | Same loop with more control over the fix steps. |
| `requireArtifactStep` | Fail the context until a file exists (requirements.md, and so on). |
| `openPrPostTeardown` | After push, open a GitHub PR with `gh` on `PATH`. Opt-in, not built into the CLI. |
| `folderBacklogContexts` | Context list from `backlogItems/todo/`. |
| `folderSetTaskDoneStep` | Move a finished item to `completed/` after the context succeeds. |
| `ephemeralContextListFn` | N fresh synthetic contexts per run (hunts, one-off scans). |
| `shellCommand` | `{ executable, args }` for `sh -c`. |

`retryUntilGreen` is the usual wrapper: iteration 0 runs your steps, retries call `fixSteps` or a default “here is the command output, fix it” prompt, until `validationCommandFn` exits 0 or the cap is hit.

```ts config.ts
import { defineConfig } from '@lumpcode/cli-utils'
import { retryUntilGreen, requireArtifactStep, shellCommand } from '@lumpcode/recipes'

export default defineConfig({
  command: 'cursor',
  contextListJson: { FILE: 'src/{NAME}.ts', REQ: 'docs/{NAME}.md' },
  steps: retryUntilGreen({
    steps: [{ promptTemplate: 'Write @{REQ} for @{FILE}.' }],
    validationCommandFn: requireArtifactStep('REQ'),
  }),
})
```

`shellCommand` is `{ executable: 'sh', args: ['-c', script] }`:

```ts
commandFn: () => shellCommand('npm test && npm run lint')
```

## Recipe factories

These return a full lump config. Pass `configUrl: import.meta.url` so the recipe can find its lump folder.

| Recipe | For | Example |
| --- | --- | --- |
| `backlog` | A folder of tickets with stages you define. One stage is enough. | [Folder backlog](backlog.md) |
| `featureBacklog` | Features that go through requirements, tests, then implementation, one PR per stage. | [A feature backlog in git](../examples/backlogs.md#a-feature-backlog-in-git) |
| `abstractionFinder` | Files one new refactor ticket per pass while the queue is under a cap. | [Find, file, implement](../examples/pipelines.md#find-file-implement) |
| `abstractionBacklog` | Implements those tickets with a validation loop. | [Find, file, implement](../examples/pipelines.md#find-file-implement) |

### `featureBacklog` options

| Option | Default | Meaning |
| --- | --- | --- |
| `implValidateCommand` | none | Shell command the `impl` stage loops on until it passes. |
| `primaryDiscoveryBranch` | `dev` | Your integration branch. Items without a test stage run from here. |
| `itemDiscoveryBranchPrefix` | `feature` | Items with a test stage, and tickets, run on `feature/<item>`. List `feature/*` in `primaryBranches`. |
| `promptFns` | built-in | Replace or wrap the prompt of one stage (`req`, `testPlan`, `testImpl`, `impl`, `directImpl`). Defaults are exported (`defaultImplPrompt`, …). |

Per item, in `desc.yml`:

| Field | Meaning |
| --- | --- |
| `name`, `task` | Required. `name` matches the folder. |
| `priority` | Lower runs sooner. |
| `dependsOn` | Other item names that must be finished first. |
| `workflow` | Stages, any of `req` or `manualReq`, `testPlan`, `testImpl`, `impl` or `directImpl`. Omitted: `[req, testPlan, testImpl]` then `impl`. `manualReq` waits for a `requirements.md` you write. `directImpl` implements from `desc.yml` alone. |
| `manual` | `true` keeps the agent away from this item. |

Big features: put tickets in `todo/<parent>/tickets/<ticket>/desc.yml`. The parent never runs a stage itself; when every ticket is done, it moves to `completed/`.

Editors autocomplete `desc.yml` with `# yaml-language-server: $schema=https://lumpcode.com/schemas/featureBacklogDesc.schema.json` on the first line. Generic `backlog` and `abstractionBacklog` items use `https://lumpcode.com/schemas/backlogDesc.schema.json`.

## Open a pull request after push

Lumpcode stops at `git push`. To also open a GitHub PR for each pushed branch, add `openPrPostTeardown` to any lump:

```ts config.ts
import { featureBacklog, openPrPostTeardown } from '@lumpcode/recipes'

export default featureBacklog({
  configUrl: import.meta.url,
  postTeardownWorkspaceFn: openPrPostTeardown({ provider: 'github' }),
})
```

It needs `gh` on `PATH`, logged in. It skips when the branch never reached `origin` or a PR already exists, and only logs if creating the PR fails. Works with plain `defineConfig` too: `postTeardownWorkspaceFn: openPrPostTeardown({ provider: 'github' })`.

## `defineConfig` generics

Recipes and kit helpers that carry variables keep the same `<V, SV>` defaults as `defineConfig`. Untyped `featureBacklog({ … })` stays valid. Pass explicit type args when you refine preset option bags.
