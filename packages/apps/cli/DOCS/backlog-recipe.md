# Folder backlog (backlog recipe)

Readable website version: [lumpcode.com/docs/author/backlog](https://www.lumpcode.com/docs/author/backlog).

Some work is a list of tickets, not a file glob. Lumpcode runs your coding agent through that list as a **lump**: one campaign, one **context** per ticket, one reviewable branch at a time. What is finished lives on your git remote.

This page is the generic `backlog` recipe from [`@lumpcode/recipes`](https://www.npmjs.com/package/@lumpcode/recipes). You scaffold a lump, drop a `desc.yml` under `backlogItems/todo/`, preview, then run.

The published `/lumpcode` skill is optional (`npx skills add lumpcode/skills`). It helps the agent **in your editor** write and update lumps. It is not the agent that runs inside the lump.

## Prerequisites

- Lumpcode CLI on `PATH`: `npm install -g @lumpcode/cli` (Node 22+). First-time setup: [get-started.md](./get-started.md).
- A git repository with `origin`. The primary branch (usually `main`) must already exist on `origin`.
- A CLI coding agent on `PATH` (`cursor-agent` or `copilot`).
- `.lumpcode/` from `lumpcode project-setup` (creates committed `project.json` and gitignored `local.json`).
- Git `user.name` and `user.email` set so commits succeed.

If you have not run a lump yet, do [get-started.md](./get-started.md) first, then come back.

## 1. Install packages in this repo

The global CLI does not resolve recipes. Add them to **this project's** `package.json` so a dedicated worker clone gets them from `npm install`.

```bash
npm install --save-dev @lumpcode/cli-utils @lumpcode/recipes
```

## 2. Scaffold the lump

```bash
lumpcode lump-create ticketBacklog --config ts
```

That writes a stub `config.ts`. Replace it. JSON cannot hold the recipe factory. Config precedence is `config.ts` > `config.js` > `config.json`.

## 3. Write the config

One stage is enough. `resolveItem` picks that stage for every ticket. `completion: 'moveToDone'` moves the folder to `completed/` after a successful context.

`.lumpcode/lumps/ticketBacklog/config.ts`:

```ts
import { backlog } from '@lumpcode/recipes';

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
    return { stage: 'implement' };
  },
});
```

`configUrl: import.meta.url` is required so the recipe can find the lump folder. Do not `path.join(import.meta.url, …)`. Swap `command` to `'copilot'` if that is the binary on `PATH`.

The recipe fills these context variables (usable in `{VAR}` / `@{VAR}`):

| Variable | From |
|----------|------|
| `TASK_NAME` | `desc.yml` `name` |
| `TASK` | `desc.yml` `task` |
| `BACKLOG_ITEM_DIR` | `backlogItems/todo/<name>` |
| `BACKLOG_ITEMS_DIR` | the `backlogItems/` folder |
| `BACKLOG_STAGE` | the stage `resolveItem` returned |

`backlog` reserves `getContextListFn` and `steps`. Other lump fields (`command`, `discoveryBranch`, hooks) still pass through. Full field list: [lump-config.md](./lump-config.md). Recipe API: the [`@lumpcode/recipes` README](https://github.com/lumpcode/lumpcode/blob/main/packages/recipes/README.md).

## 4. Add one item

Folder name and `name:` must match. Letters, digits, `_`, `-` only.

`.lumpcode/lumps/ticketBacklog/backlogItems/todo/add-health-route/desc.yml`:

```yaml
# yaml-language-server: $schema=https://lumpcode.com/schemas/backlogDesc.schema.json
name: add-health-route
task: >-
  Add a GET /health handler that returns JSON { "ok": true }.
  Keep it next to the existing HTTP server.
priority: 1
```

`priority` is per lump: a lower number runs sooner. A second item can wait with `dependsOn: [add-health-route]`. That context stays skipped until the first ticket's marker is **merged** to the integration branch, not merely pushed. Status details: [concepts.md](./concepts.md).

```text
.lumpcode/lumps/ticketBacklog/
├── config.ts
└── backlogItems/
    └── todo/add-health-route/desc.yml
```

## 5. Preview, then run

```bash
lumpcode lump-plan ticketBacklog --contexts --prompts
lumpcode run ticketBacklog
```

`lump-plan` loads the config and prints the context. It does not run the agent, branch, or push. Fix what it reports, then run. Flags: [commands.md](./commands.md).

On the laptop (`mode: "shared"` in `.lumpcode/local.json`), `run` writes on this branch. A dirty tree is fine. After a successful walk, a TTY shows `[c]` / `[e]`. `c` stamps LUMP markers (no push). Then push yourself. Shared mode: [local-config.md](./local-config.md).

A dedicated worker still cuts `lump/ticketBacklog/add-health-route`, commits `LUMP: ticketBacklog - add-health-route`, and pushes. You open that branch as a pull request, adjust it if needed, and merge. Lumpcode does not merge and does not open the PR. Opening a GitHub PR is opt-in via `openPrPostTeardown` in [`@lumpcode/recipes`](https://github.com/lumpcode/lumpcode/blob/main/packages/recipes/README.md).

On success the recipe moves the folder to `backlogItems/completed/add-health-route/` and stamps `completedAt`. After you merge, that ticket is gone from `todo/` and the marker is on the integration branch. The next run picks the next item.

Commit `.lumpcode/` (and the new npm deps) before a worker clone needs them.

Need `workflow` stages, tickets under a parent, or a requirements gate? That is `featureBacklog` in the recipes README, not this page. Other copyable shapes: [examples.md](./examples.md).
