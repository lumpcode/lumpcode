---
title: Recipes
description: Optional helpers for retry loops, folder backlogs, and opening a GitHub PR after push. The CLI runs without this package.
---

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

These return a full lump config. They need `configUrl: import.meta.url` so the recipe can find the lump folder (do not `path.join(import.meta.url, …)`).

| Recipe | For |
| --- | --- |
| `backlog` | Folder items plus a typed stage map you define. |
| `featureBacklog` | Feature campaign with a `workflow` array (`req`, `testPlan`, `testImpl`, `impl` / `directImpl`), tickets. |
| `abstractionFinder` | One ephemeral context per pass that files a backlog item while `todo/` is under a cap. |
| `abstractionBacklog` | Implement those items with verify-until-green, then move to completed. |

`featureBacklog` is opinionated: omit `workflow` means `[req, testPlan, testImpl]` then `impl`. Put `req` in the array to let the lump write requirements; omit it to wait for a human file (except `directImpl`, which may implement from `desc.yml` alone). `manual: true` skips the item. Optional `promptFns` replaces the main prompt for a stage. Do not pass `discoveryBranch` / `discoveryBranches`; the recipe emits them from `primaryDiscoveryBranch` / `itemDiscoveryBranchPrefix` (defaults `dev` / `feature`). Tickets live at `todo/<parent>/tickets/<ticket>/` and do not run on the primary. After every ticket finishes, one parent `completion` context (no agent) depends on all ticket impl names and moves the parent folder into `completed/`.

```ts config.ts
import { featureBacklog } from '@lumpcode/recipes'

export default featureBacklog({
  configUrl: import.meta.url,
  command: 'cursor',
})
```

## Opening pull requests

Lumpcode’s engine **pushes a branch**. It does not open a PR. If you want that extra step:

```ts config.ts
import { featureBacklog, openPrPostTeardown } from '@lumpcode/recipes'

export default featureBacklog({
  configUrl: import.meta.url,
  postTeardownWorkspaceFn: openPrPostTeardown({ provider: 'github' }),
})
```

`gh` must be on `PATH`. Skip if the branch never reached origin or a PR already exists. Create failures are logged; they do not fail the run.

## `defineConfig` generics

Recipes and kit helpers that carry variables keep the same `<V, SV>` defaults as `defineConfig`. Untyped `featureBacklog({ … })` stays valid. Pass explicit type args when you refine preset option bags.
