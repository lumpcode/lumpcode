# Lumpcode CLI

**The simplest software factory lives in your repo.** Open source and git only: no account, no database, nothing to deploy.

A **lump** is one factory, as code: a folder in `.lumpcode/` that says what to work on, what to prompt, which agent to run, and how to check the result. Make it as narrow as one migration or as broad as a spec backlog that keeps growing. You commit it like the rest of your code. Start with one, grow a fleet.

Lumpcode runs your coding agent through the lump piece by piece, inside your repo, so the agent has your skills, `AGENTS.md`, and docs from the first run. It pushes a branch for each piece of work, which you review as a PR or let your CI merge. Git is the only state, so it always picks up where it left off.

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

Each pass takes the next unfinished context, runs the agent, and pushes `lump/portToVue/<context>`. Open the PR yourself, or have it [opened automatically after the push](https://github.com/lumpcode/lumpcode/blob/main/packages/apps/cli/DOCS/author/recipes.md#open-a-pull-request-after-push); then review and merge. New lumps are picked up when you merge them, with no restart. Another folder is enough to start; an always-on machine is what the worker is built for. Guide: [Leave a worker running](https://www.lumpcode.com/docs/start/worker).

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
| [`@lumpcode/recipes`](https://www.npmjs.com/package/@lumpcode/recipes) | Plug-and-run factories in one function call (`featureBacklog`, …), plus a kit: retry until green, open a PR after push |

Install both in your project (not globally) when your lumps import them, so a worker clone gets them from `npm install`.

## Development

From `packages/apps/cli`: `npm test` (unit), `npm run test:e2e` / `npm run test:e2e:node` (scenarios). See `scripts/run-e2e.mjs` and `src/e2e/`.
