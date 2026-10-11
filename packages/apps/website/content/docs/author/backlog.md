---
title: Folder backlog
description: Scaffold the backlog recipe, add one ticket folder, preview with lump-plan, then run. One context per item.
---

Some work is a list of tickets, not a file glob. Lumpcode runs your coding agent through that list as a **lump**: one campaign, one **context** per ticket, one reviewable branch at a time. What is finished lives on your git remote.

This page is the generic `backlog` recipe. You scaffold a lump, drop a `desc.yml` under `backlogItems/todo/`, preview, then run.

`npx skills add lumpcode/skills` is optional. It helps the agent **in your editor** write and update lumps. It is not the agent that runs inside the lump.

You need the [CLI](/docs/start/first-pr), a git `origin`, a CLI agent on `PATH` (`cursor-agent` or `copilot`), and `.lumpcode/` from `lumpcode project-setup`. Git `user.name` and `user.email` must be set so commits succeed.

## 1. Install packages in this repo

The global CLI does not resolve recipes. Add them to **this project's** `package.json` so a [worker](/docs/start/worker) clone gets them from `npm install`.

```bash
npm install --save-dev @lumpcode/cli-utils @lumpcode/recipes
```

## 2. Scaffold the lump

```bash
lumpcode lump-create ticketBacklog --config ts
```

That writes a stub `config.ts`. Replace it. JSON cannot hold the recipe factory.

## 3. Write the config

One stage is enough. `resolveItem` picks that stage for every ticket. `completion: 'moveToDone'` moves the folder to `completed/` after a successful context.

```ts .lumpcode/lumps/ticketBacklog/config.ts
import { backlog } from '@lumpcode/recipes'

export default backlog({
  configUrl: import.meta.url,
  command: 'cursor',
  stages: {
    implement: {
      completion: 'moveToDone',
      steps: [
        {
          promptTemplate:
            'Implement this ticket.\n\n{TASK}\n\nRead @{BACKLOG_ITEM_DIR}/desc.yml. Stay close to that task.',
        },
      ],
    },
  },
  resolveItem() {
    return { stage: 'implement' }
  },
})
```

`configUrl: import.meta.url` is required so the recipe can find the lump folder. Do not `path.join(import.meta.url, …)`. Swap `command` to `'copilot'` if that is the binary on `PATH`.

The recipe fills these context variables (usable in `{VAR}` / `@{VAR}`):

| Variable | From |
| --- | --- |
| `TASK_NAME` | `desc.yml` `name` |
| `TASK` | `desc.yml` `task` |
| `BACKLOG_ITEM_DIR` | `backlogItems/todo/<name>` |
| `BACKLOG_ITEMS_DIR` | the `backlogItems/` folder |
| `BACKLOG_STAGE` | the stage `resolveItem` returned |

## 4. Add one item

Folder name and `name:` must match. Letters, digits, `_`, `-` only.

```yaml .lumpcode/lumps/ticketBacklog/backlogItems/todo/add-health-route/desc.yml
# yaml-language-server: $schema=https://lumpcode.com/schemas/backlogDesc.schema.json
name: add-health-route
task: >-
  Add a GET /health handler that returns JSON { "ok": true }.
  Keep it next to the existing HTTP server.
priority: 1
```

`priority` is per lump: a lower number runs sooner. A second item can wait with `dependsOn: [add-health-route]`. That context stays skipped until the first ticket's marker is **merged** to the integration branch, not merely pushed.

```text .lumpcode/lumps/ticketBacklog/
config.ts
backlogItems/
  todo/add-health-route/desc.yml
```

## 5. Preview, then run

```bash
lumpcode lump-plan ticketBacklog --contexts --prompts
lumpcode run ticketBacklog
```

`lump-plan` loads the config and prints the context. It does not run the agent or push. Fix what it reports, then run.

On the laptop (`mode: "shared"`), `run` writes on this branch. A dirty tree is fine. After a successful walk, type `c` if you want LUMP markers (no push), then push yourself.

A [worker](/docs/start/worker) still cuts `lump/ticketBacklog/add-health-route`, commits `LUMP: ticketBacklog - add-health-route`, and pushes. You open that branch as a pull request, adjust it if needed, and merge. Lumpcode does not merge and does not open the PR. Opening a GitHub PR is opt-in on [Recipes](/docs/author/recipes).

On success the recipe moves the folder to `backlogItems/completed/add-health-route/` and stamps `completedAt`. After you merge, that ticket is gone from `todo/` and the marker is on the integration branch. The next run picks the next item.

Commit `.lumpcode/` (and the new npm deps) before a worker clone needs them.

Need `workflow` stages, tickets under a parent, or a requirements gate? That is `featureBacklog` on [Recipes](/docs/author/recipes), not this page.
