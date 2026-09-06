---
title: Overview
description: Lumpcode runs your coding agent through a campaign too big for one chat, one reviewable branch at a time. These pages are the operator manual.
---

A **lump** is that campaign: a folder in your repo that names the work, the prompt, and the agent. Lumpcode walks the unfinished items, runs the agent, and pushes a `lump/…` branch. You open the pull request, adjust it if needed, and merge. The next run skips what already landed.

You just need git and a CLI agent. There is no account and no database. Finished work is a commit on your git remote.

<div class="docs-cards">
<a class="docs-card" href="/docs/start/first-pr"><strong>First PR</strong>Install the CLI and run one campaign by hand on your laptop.</a>
<a class="docs-card" href="/docs/start/worker"><strong>Leave a worker running</strong>A second clone you never edit. Branches keep arriving while you merge.</a>
<a class="docs-card" href="/docs/author/write-a-lump"><strong>Write a lump</strong>Two required pieces: what to work on, and what to prompt.</a>
<a class="docs-card" href="/docs/reference/examples"><strong>Examples</strong>Migrations, ticket queues, coverage sweeps, and retry-until-green.</a>
</div>

## How to read these pages

Start with [core terms](/docs/start/terms) if the words are new, then [how a run works](/docs/start/run). Authoring lives under **Write a lump**, **Contexts**, and **Prompts**. Config reference is for when you already know the shape and need a field. [Daemon files](/docs/config/daemons) is the committed `.lumpcode/daemons/` recipe. [Types](/docs/config/types) is the hook signatures. [Commands](/docs/reference/commands) is the CLI map. [Troubleshooting](/docs/reference/troubleshooting) is for the surprises git status can throw.

The tutorials at [Get started](/docs/start/first-pr) are the shortest path to a real branch. These docs are what you open the week after, when the campaign is real.

## What Lumpcode does not do

- It does not merge. You do that.
- It does not open pull requests by itself. A run stops at `git push`. Opening the PR is opt-in via [`@lumpcode/recipes`](/docs/author/recipes).
- It does not edit your day-to-day checkout when the machine is in `shared` mode. That is the default after `project-setup`.

## Packages

| Package | Install when |
| --- | --- |
| [`@lumpcode/cli`](https://www.npmjs.com/package/@lumpcode/cli) | You want the `lumpcode` command. This is the product. |
| [`@lumpcode/cli-utils`](https://www.npmjs.com/package/@lumpcode/cli-utils) | You author `config.ts` and want `defineConfig` plus typed helpers. |
| [`@lumpcode/recipes`](https://www.npmjs.com/package/@lumpcode/recipes) | You want retry loops, folder backlogs, or `openPrPostTeardown`. |

Add the last two to the **project** `package.json` (not only a global CLI) so a worker clone gets them from `npm install`.

Hook signatures: [Types](/docs/config/types).
