# Ticket backlogs

Lumps whose work list is a folder of tickets in the repo. Adding a ticket is a commit, finishing one moves its folder to `completed/`, and the whole queue is reviewed like code.

New to ticket folders? The [folder backlog](../author/backlog.md) tutorial builds the smallest one step by step.

## A feature backlog in git

A roadmap where each feature goes through stages, each stage its own PR: requirements, a test plan, skipped tests, then the implementation that makes them pass. `featureBacklog` from `@lumpcode/recipes` is that whole pipeline.

```ts .lumpcode/lumps/backlog/config.ts
import { featureBacklog, openPrPostTeardown } from '@lumpcode/recipes'

export default featureBacklog({
  configUrl: import.meta.url,
  command: 'cursor',
  primaryDiscoveryBranch: 'main', // default 'dev'
  implValidateCommand: 'npm run build && npm test',
  maximumNumberOfConcurrentBranches: 2,
  postTeardownWorkspaceFn: openPrPostTeardown({ provider: 'github' }),
})
```

The recipe picks up items from your primary branch and from `feature/<item>` branches, so the worker must scan both:

```json .lumpcode/project.json
{
  "projectName": "my-app",
  "primaryBranches": ["main", "feature/*"],
  "refreshCommand": "npm install"
}
```

`refreshCommand` runs on the worker after each fetch, so a lump that imports `@lumpcode/recipes` always has its packages installed.

One folder per feature, with a `desc.yml`:

```yaml .lumpcode/lumps/backlog/backlogItems/todo/export-csv/desc.yml
# yaml-language-server: $schema=https://lumpcode.com/schemas/featureBacklogDesc.schema.json
name: export-csv
task: >-
  Add a "Download CSV" button to the orders table. Export the rows that match the
  current filters, with the visible columns, in the table's sort order.
priority: 2
workflow: [req, testImpl, impl]
```

An item with a test stage runs on its own feature branch, so half-done work never sits on `main`. Start it by pushing that branch:

```bash
git push origin main:feature/export-csv
```

Then, one PR at a time, each targeting `feature/export-csv`:

| Stage | The agent | You review |
| --- | --- | --- |
| `req` | writes `requirements.md` from the task | the plan, before any code |
| `testImpl` | adds the tests that define "done", skipped | the tests |
| `impl` | implements, unskips, and loops until `implValidateCommand` passes | the feature |

Each stage waits until the previous one is **merged**, so you can fix the requirements in their PR and the implementation follows your version. After `impl`, the folder moves to `backlogItems/completed/export-csv/` and you merge `feature/export-csv` into `main`.

`workflow` picks the stages. Omitted, it is `[req, testPlan, testImpl]` then `impl`. Items without a test stage, like `[req, impl]` or a small `[directImpl]` fix, skip the feature branch and run straight from `main`. Write `requirements.md` yourself and use `manualReq` instead of `req`. Big features get tickets under the parent (`todo/export-csv/tickets/<ticket>/desc.yml`); the parent closes when every ticket is done. Every option: [Recipes](../author/recipes.md#recipe-factories).

## Lanes that share one factory

Separate queues for features, small quality-of-life fixes, and bugs, so a quick fix never waits behind a big feature. Each lane is its own lump with its own cap and its own `backlogItems/`, and all three use the same rules from one helper.

```text .lumpcode/
helpers/
  teamBacklog.ts
lumps/
  backlog/config.ts      backlogItems/
  qol/config.ts          backlogItems/
  bugfixes/config.ts     backlogItems/
```

```ts .lumpcode/helpers/teamBacklog.ts
import { defaultImplPrompt, featureBacklog, openPrPostTeardown } from '@lumpcode/recipes'

export function teamBacklog(configUrl: string, options: { maxOpen?: number } = {}) {
  return featureBacklog({
    configUrl,
    command: 'cursor',
    primaryDiscoveryBranch: 'main',
    implValidateCommand: 'npm run build && npm test',
    maximumNumberOfConcurrentBranches: options.maxOpen ?? 2,
    promptFns: {
      impl: async (input) =>
        `${await defaultImplPrompt(input)}\n\nWhen done, follow @.agents/skills/capture-learnings/SKILL.md ` +
        `and write what you learned to @${input.context.variables.BACKLOG_ITEM_DIR}/learnings.md.`,
    },
    postTeardownWorkspaceFn: openPrPostTeardown({ provider: 'github' }),
  })
}
```

```ts .lumpcode/lumps/qol/config.ts
import { teamBacklog } from '../../helpers/teamBacklog'

export default teamBacklog(import.meta.url, { maxOpen: 3 })
```

- `promptFns` wraps the recipe's default prompt for one stage instead of replacing it. Here every implementation also leaves a `learnings.md` for the reviewer.
- Change the helper once and every lane follows on the next pass.
- Lanes differ mostly through their tickets' `workflow`: features take the full `[req, testPlan, testImpl]` path, bug tickets are often `[manualReq, directImpl]` (you write the diagnosis, the agent fixes it) or just `[directImpl]`.
- Pair this with a [triage lump](pipelines.md#triage-an-inbox-into-lanes) that files new tickets into the right lane.

## One stage, your own prompt

Not every queue needs requirements and tests. Docs tasks, copy changes, and chores can go straight to implementation with the generic `backlog` recipe:

```ts .lumpcode/lumps/docs/config.ts
import { backlog } from '@lumpcode/recipes'

export default backlog({
  configUrl: import.meta.url,
  command: 'cursor',
  stages: {
    implement: {
      completion: 'moveToDone',
      steps: [{ promptTemplate: 'Do this docs task:\n\n{TASK}\n\nFollow the style of the existing pages.' }],
    },
  },
  resolveItem: () => ({ stage: 'implement' }),
})
```

Walkthrough: [Folder backlog](../author/backlog.md).
