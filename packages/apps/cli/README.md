# Lumpcode CLI

Lumpcode runs your coding agent through work too big for one chat: a migration, a ticket backlog, a test suite to build out. It takes one item at a time, runs the agent, and pushes a branch you review as a normal PR. Progress lives in your git history, so it always picks up where it left off. No account, no database.

You describe the campaign once as a **lump**: what to work on, what to prompt, which agent. That is **loop engineering**: you design the loop, Lumpcode runs it.

Full docs: [lumpcode.com/docs](https://www.lumpcode.com/docs/start/overview).

## Install

Requires Node.js 22+, a git repo you can push to, and a CLI agent on `PATH` (Cursor, Claude Code, Copilot, Codex, OpenCode, or your own).

```bash
npm install -g @lumpcode/cli
```

Optional: `npx skills add lumpcode/skills` teaches the agent in your editor to write and fix lumps.

## First run

From the root of your repo:

```bash
lumpcode setup
```

`setup` creates `.lumpcode/`, writes a first lump, and runs it on your current branch. Nothing is pushed: review the changes, type `c` to commit them, and push yourself. Walkthrough: [First PR](https://www.lumpcode.com/docs/start/first-pr).

## A lump

`.lumpcode/lumps/portToVue/config.json`:

```json
{
  "$schema": "https://lumpcode.com/schemas/lumpConfig.schema.json",
  "contextListJson": {
    "COMPONENT": "src/components/{NAME}/index.tsx",
    "TEST": "src/components/{NAME}/index.test.tsx"
  },
  "prompt": {
    "promptTemplate": "Port @{COMPONENT} to Vue 3 and update @{TEST}.",
    "command": "cursor"
  }
}
```

Every folder where both files exist becomes one **context**, one unit of work. `@{COMPONENT}` becomes the matched path. Check it without calling the agent:

```bash
lumpcode lump-plan portToVue --contexts --prompts
```

Need more than one prompt, a test gate with retries, or contexts from an issue tracker? Write `config.ts` instead. See the [examples](https://www.lumpcode.com/docs/examples/overview).

## Leave a worker running

On a second clone you never edit (another folder is enough), set `"mode": "dedicated"` in `.lumpcode/local.json` and start the scheduler:

```bash
lumpcode start           # runs every lump on a schedule, in the background
lumpcode dashboard       # live view in the browser
lumpcode transcript --lumpName portToVue   # follow the agent
lumpcode stop
```

Each pass takes the next unfinished context, runs the agent, and pushes `lump/portToVue/<context>`. You open the PR and merge. New lumps are picked up when you merge them, with no restart. Guide: [Leave a worker running](https://www.lumpcode.com/docs/start/worker).

## Docs

| Page | Contents |
| --- | --- |
| [First PR](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/start/first-pr.md) | Install, setup, rehearse on your laptop |
| [Worker](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/start/worker.md) | A second clone that keeps pushing branches |
| [Watch it work](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/start/observe.md) | Dashboard, transcripts, logs, status |
| [Examples](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/examples/overview.md) | Migrations, issue queues, backlogs, pipelines |
| [Write a lump](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/author/write-a-lump.md) | Contexts, prompts, steps, agents |
| [Commands](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/reference/commands.md) | Every subcommand and flag |
| [All pages](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/README.md) | The full docs index |

## Related packages

| Package | Role |
| --- | --- |
| [`@lumpcode/cli-utils`](https://www.npmjs.com/package/@lumpcode/cli-utils) | `defineConfig` and typed helpers for `config.ts` |
| [`@lumpcode/recipes`](https://www.npmjs.com/package/@lumpcode/recipes) | Retry loops, folder backlogs, PR opening |

Install both in your project (not globally) when your lumps import them, so a worker clone gets them from `npm install`.

## Development

From `packages/apps/cli`: `npm test` (unit), `npm run test:e2e` / `npm run test:e2e:node` (scenarios). See `scripts/run-e2e.mjs` and `src/e2e/`.
