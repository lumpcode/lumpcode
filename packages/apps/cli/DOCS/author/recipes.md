# Recipes

`@lumpcode/recipes` has two layers. **Recipes** are plug-and-run factories: one function call, such as `featureBacklog({…})`, returns a whole lump config. The **kit** holds the smaller pieces you would otherwise write by hand: retry until green, folder backlogs, opening a GitHub PR after push. Optional; the CLI runs without it.

Install when you want the factories and kit, in the **project** so a worker clone sees them after `npm install`:

```bash
npm install @lumpcode/recipes
```

The CLI binary does not bundle this package. A TypeScript lump that imports it will fail on a dedicated clone that never ran `npm install`.

## Recipe factories

Each one returns a full lump config, so a lump can be a single call. Pass `configUrl: import.meta.url` so the recipe can find its lump folder.

| Recipe | For | Example |
| --- | --- | --- |
| `backlog` | A folder of tickets with stages you define. One stage is enough. | [Folder backlog](backlog.md) |
| `featureBacklog` | Features that go through requirements, tests, then implementation, one PR per stage. | [A feature backlog in git](../examples/backlogs.md#a-feature-backlog-in-git) |
| `abstractionFinder` | Files one new refactor ticket per pass while the queue is under a cap. | [Find, file, implement](../examples/pipelines.md#find-file-implement) |
| `abstractionBacklog` | Implements those tickets with a validation loop. | [Find, file, implement](../examples/pipelines.md#find-file-implement) |

### `featureBacklog` options

| Option | Default | Meaning |
| --- | --- | --- |
| `implValidateCommand` | none | Shell command the `impl`, `directImpl`, and `testImpl` stages loop on until it passes. Omit it and the stage only prompts. |
| `maxAttempts` | `3` | Fix prompts after the first red check. Passed to `retryUntilGreen`. |
| `primaryDiscoveryBranch` | `dev` | Your integration branch. Items without a test stage run from here. |
| `itemDiscoveryBranchPrefix` | `feature` | Items with a test stage, and tickets, run on `feature/<item>`. List `feature/*` in `primaryBranches`. |
| `prompts` | built-in | Replace the prompt of one stage (`req`, `testPlan`, `testImpl`, `impl`, `directImpl`). A string, or `({ context, lumpVariables }) => string`. Defaults are exported (`defaultImplPrompt`, …). |

Per item, in `desc.yml`:

| Field | Meaning |
| --- | --- |
| `name`, `task` | Required. `name` matches the folder. |
| `priority` | Lower runs sooner. |
| `dependsOn` | Other item names that must be finished first. |
| `stages` | Stages, any of `req` or `manualReq`, `testPlan`, `testImpl`, `impl` or `directImpl`. Omitted: `[manualReq, testImpl, impl]`. `manualReq` waits for a `requirements.md` you write. `req` has the agent write that file. `directImpl` implements from `desc.yml` alone. `workflow` is a deprecated alias: it still runs, and warns once per item each time the list is read. Setting both fails. |
| `manual` | `true` keeps the agent away from this item. |

Big features: put tickets in `todo/<parent>/tickets/<ticket>/desc.yml`. The parent never runs a stage itself; when every ticket is done, it moves to `completed/`. A ticket waits for its parent's `dependsOn` as well as its own. Its own `dependsOn` names sibling tickets.

Editors autocomplete `desc.yml` with `# yaml-language-server: $schema=https://lumpcode.com/schemas/featureBacklogDesc.schema.json` on the first line. Generic `backlog` and `abstractionBacklog` items use `https://lumpcode.com/schemas/backlogDesc.schema.json`.

`backlog` stages take a `workflow` function and `completion: 'keepPending' | 'moveToDone'`. `moveToDone` calls `setTaskDone` after that workflow, including when it returns `succeeded: false`. `abstractionFinder` takes an optional `workflow` that replaces the default prompt; `scanCommand` still runs first. `abstractionBacklog` takes an optional `workflow` that replaces the default implement workflow.

## Steps recipes

`featureBacklogSteps`, `backlogSteps`, `abstractionFinderSteps`, and `abstractionBacklogSteps` are the same recipes as steps. Behavior and options match the workflow recipes, except the step-typed fields keep their old names: `promptFns`, `stages.<name>.steps`, `steps`, and `implSteps`. `featureBacklogSteps` still reads `workflow` from `desc.yml` and does not read `stages`.

## Kit you will actually reach for

Workflow helpers are async functions you call from [`workflow`](../config/lump.md). The steps versions are in [Steps kit](#steps-kit).

| Helper | Use when |
| --- | --- |
| `retryUntilGreen` | Run a check. On failure, prompt the agent with the output and try again. |
| `requireArtifact` | Prompt until a file exists in the workspace. |
| `mustSucceed` | Return a succeeded shell or agent result, or throw with that result as `cause`. |
| `openPrPostTeardown` | After push, open a GitHub PR with `gh` on `PATH`. Opt-in, not built into the CLI. |
| `folderBacklogContexts` | Context list from `backlogItems/todo/`. |
| `setTaskDone` | Move a finished item from `todo/` to the same path under `completed/` and stamp `completedAt`. |
| `folderSetTaskDoneStep` | The steps version of `setTaskDone`. |
| `ephemeralContextListFn` | N fresh synthetic contexts per run (hunts, one-off scans). |

```ts config.ts
import { defineConfig } from '@lumpcode/cli-utils'
import { retryUntilGreen } from '@lumpcode/recipes'

export default defineConfig({
  command: 'cursor',
  async workflow({ agent, shell }) {
    const session = await agent.session()
    const green = await retryUntilGreen({
      session,
      shell,
      check: 'npm test',
      prompt: 'Implement the ticket.',
    })
    return {
      succeeded: green.succeeded,
      push: true,
      message: green.succeeded ? 'Tests passed.' : 'Tests still failing.',
    }
  },
})
```

`maxAttempts` is how many fix prompts follow a red check (default 3). A check that stays red returns `{ succeeded: false }` and does not throw. `requireArtifact` prompts at most twice by default (`Write <path>. It is missing.`).

## Steps kit

| Helper | Use when |
| --- | --- |
| `retryUntilGreenSteps` | Agent edits, then your test/build command, retry with the failure output. |
| `getValidationLoopSteps` | Same loop with more control over the fix steps. |
| `requireArtifactStep` | Exit 1 when a file is missing (requirements.md, and so on). The retry loop decides whether the context fails. |
| `shellCommand` | `{ executable, args }` for `sh -c`. |

`retryUntilGreenSteps` is the usual wrapper: iteration 0 runs your steps, retries call `fixSteps` or a default “here is the command output, fix it” prompt, until `validationCommandFn` exits 0 or the cap is hit. Hitting the cap still pushes the branch, and sets `lumpVariables.__VALIDATION_FAILED__` (`true` when the last check stayed red, `false` when a check passed). Pass `validationFailedVariableName` to write the flag under another name, for example when two loops run in one context. Pass `pushOnValidationFailure: false` to fail the context instead of pushing. `requireArtifactStep` still exits 1 when the file is missing. The loop, not that helper, decides whether the context fails.

```ts config.ts
import { defineConfig } from '@lumpcode/cli-utils'
import { retryUntilGreenSteps, requireArtifactStep, shellCommand } from '@lumpcode/recipes'

export default defineConfig({
  command: 'cursor',
  contextListJson: { FILE: 'src/{NAME}.ts', REQ: 'docs/{NAME}.md' },
  steps: retryUntilGreenSteps({
    steps: [{ promptTemplate: 'Write @{REQ} for @{FILE}.' }],
    validationCommandFn: requireArtifactStep('REQ'),
  }),
})
```

`shellCommand` is `{ executable: 'sh', args: ['-c', script] }`:

```ts
commandFn: () => shellCommand('npm test && npm run lint')
```

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

The default body is `LUMP contexts: <names>`. When a pushed context returned a message, the body is one `### <name>` section per message instead. A pushed context that did not succeed opens the PR as a draft. Pass `draftOnFailure: false` to leave it ready for review. `title` and `body` may be functions of the teardown input, which includes `contextResults`.

## `defineConfig` generics

Recipes and kit helpers that carry variables keep the same `<V, SV>` defaults as `defineConfig`. Untyped `featureBacklog({ … })` stays valid. Pass explicit type args when you refine preset option bags.
