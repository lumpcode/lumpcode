# Overview

Lumpcode runs your coding agent through work too big for one chat, one reviewable branch at a time. You need git and a CLI agent. There is no account and no database.

## What it does

Some work is a list, not a task: two hundred components to migrate, forty tickets, every module that has no test. You describe that list once as a **lump**, a folder in your repo with three things:

- **what to work on**: a path pattern, a ticket folder, an API you query
- **what to tell the agent**: one prompt, or several steps gated on your build or tests
- **which agent**: Cursor, Claude Code, Copilot, Codex, OpenCode, or your own

Lumpcode takes the next unfinished item, runs the agent on it, commits the result, and pushes a branch. You open that branch as a pull request, fix it if the agent missed, and merge. The next run skips what you merged.

```text
.lumpcode/lumps/portToVue/config.json     what to work on, what to prompt, which agent
          │
          ▼
worker (lumpcode start)                   next unfinished item, one branch
          │
          ▼
lump/portToVue/UserCard  →  PR  →  merge  →  next pass picks DataTable
```

On your laptop, `lumpcode run` rehearses the same loop in place on your current branch, so you can check the prompt before a worker takes over.

## Where to start

<div class="docs-cards">
<a class="docs-card" href="first-pr.md"><strong>First PR</strong>Install, run <code>lumpcode setup</code>, rehearse one lump on your laptop.</a>
<a class="docs-card" href="worker.md"><strong>Leave a worker running</strong>A second clone that keeps pushing branches while you review.</a>
<a class="docs-card" href="../examples/overview.md"><strong>Examples</strong>Migrations, issue queues, ticket backlogs, lumps that feed lumps.</a>
<a class="docs-card" href="observe.md"><strong>Watch it work</strong>Dashboard, live transcripts, logs, and status from git.</a>
</div>

## What it does not do

- It never merges. You do.
- It stops at `git push`. Opening the pull request is yours, or opt-in with [`openPrPostTeardown`](../author/recipes.md#open-a-pull-request-after-push).
- It never pushes agent work to your main branch. Work lands on `lump/<lumpName>/…` branches.

## Packages

| Package | Install when |
| --- | --- |
| [`@lumpcode/cli`](https://www.npmjs.com/package/@lumpcode/cli) | Always. This is the `lumpcode` command. |
| [`@lumpcode/cli-utils`](https://www.npmjs.com/package/@lumpcode/cli-utils) | You write `config.ts` and want `defineConfig` and typed helpers. |
| [`@lumpcode/recipes`](https://www.npmjs.com/package/@lumpcode/recipes) | You want retry loops, folder backlogs, or opening a PR after push. |

Add the last two to the project `package.json`, not only globally, so a worker clone gets them from `npm install`.
