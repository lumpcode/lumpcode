# Hands-on: dedicated Lumpcode daemon

Lumpcode is a **git-first loop manager**: a small CLI that runs long agent campaigns over your own repo, in reviewable slices. Git is the gate (one PR at a time) and the source of truth (what is left is read from remote history, not a dashboard). You describe the campaign once, merge what is good, and the next tick continues with the rest.

The unit is a **lump**: a body of work too big for one chat, stored in `.lumpcode/lumps/` and worked through one isolated **context** at a time (one branch, one PR). You can run a tick by hand, or leave a daemon on a machine that stays on.

This article is that dedicated-daemon path. You author on your laptop. A second clone, that you do not develop in, runs the scheduler. When a lump lands on the primary branch, the worker picks it up.

## 1. Requirements

The dedicated clone is a checkout you do not develop in. Put it on a remote machine if you want it to run forever. Pre-flight hard-resets that tree.

You need:

- Git `origin` with fetch and push
- A coding agent CLI on `PATH` (`cursor-agent`, `copilot`, `claude`, …), already logged in
- Node 22+

Nothing else. No server, no dashboard.

Install the `/lumpcode` skill so your agent has current docs while you set this up and write configs:

```bash
npx skills add lumpcode/skills
```

Use `/lumpcode` in the session when you hit a config or CLI question.

## 2. Install the CLI

On both machines:

```bash
npm install -g @lumpcode/cli
lumpcode --version
```

## 3. Laptop: project setup, shared mode

From your day-to-day repo:

```bash
lumpcode project-setup --primaryBranch main
```

Use your real integration branch instead of `main` if that is what you merge to.

`.lumpcode/local.json` is gitignored and per machine. On the laptop it should be:

```json
{
  "mode": "shared"
}
```

Shared mode never touches this checkout. Runs go to `~/.lumpcode/project-copies/<projectName>/`.

Install `@lumpcode/cli-utils` and `@lumpcode/recipes` into this repo **now**, before the first push. Later TypeScript lumps import them from the project's `node_modules` (the global CLI does not ship them). If they are already in `package.json` when the dedicated clone is set up, that machine runs `npm install` once and does not need another install when the first lump lands.

```bash
npm install --save-dev @lumpcode/cli-utils @lumpcode/recipes
```

If the repo has no `package.json` yet, this creates a minimal one. Commit it with the Lumpcode project in the next step.

## 4. Push the Lumpcode project

Commit `.lumpcode/project.json`, the `.gitignore` updates, and `package.json` plus the lockfile. Do not commit `local.json`.

```bash
git add .lumpcode/project.json .gitignore package.json package-lock.json
git commit -m "Add Lumpcode project"
git push
```

Merge that to your primary branch if you are not already on it.

## 5. Dedicated clone: dedicated mode, then start

On the worker, clone (or pull) the same repo. `.lumpcode/` is already there, so `project-setup` will refuse. Install project deps (this is the `npm install` that pulls in `cli-utils` and `recipes`):

```bash
npm install
```

Then write `.lumpcode/local.json`:

```json
{
  "mode": "dedicated"
}
```

Then:

```bash
lumpcode start
lumpcode daemon-status
```

No lumps yet. That is fine. The default `global` daemon ticks every five minutes. When a lump appears on the primary branch, the next tick runs it. You do not restart for new lumps.

Do not edit product code in this clone.

## 6. First lump (laptop)

Back on the day-to-day repo. This example is a React → Vue migration, one component per context, with tests retried until green. `cli-utils` and `recipes` are already in the project from step 3.

```bash
lumpcode lump-create reactToVue --config ts
```

Replace `.lumpcode/lumps/reactToVue/config.ts` (adjust paths and `command` to your repo and agent):

```ts
import { defineConfig } from '@lumpcode/cli-utils';
import { retryUntilGreen, shellCommand } from '@lumpcode/recipes';

export default defineConfig({
    command: 'cursor',
    contextListJson: {
        FOLDER: 'src/components/{COMPONENT_NAME}/',
        COMPONENT: 'src/components/{COMPONENT_NAME}/{COMPONENT_NAME}.tsx',
        TEST: 'src/components/{COMPONENT_NAME}/{COMPONENT_NAME}.test.tsx',
    },
    steps: retryUntilGreen({
        steps: [
            {
                promptTemplate:
                    'Port @{COMPONENT} to Vue 3 <script setup> as {COMPONENT_NAME}.vue in @{FOLDER}. Port @{TEST} to Vitest + @vue/test-utils. Keep behavior identical.',
            },
        ],
        validationCommandFn: () => shellCommand('npm test'),
    }),
});
```

`/lumpcode` can help you reshape discovery and prompts.

## 7. Dry run, optional shared run

Still on the laptop:

```bash
lumpcode lump-plan reactToVue --plan --contexts
```

That loads the config, lists contexts, and previews the tick. It does not run the agent, branch, or push. Add `--contextName Button` to inspect one context.

If you want a real tick on one context, shared mode keeps your checkout untouched:

```bash
lumpcode run reactToVue
```

Default is one context per branch (the next eligible one). Review the pushed `lump/reactToVue/…` branch before you let the daemon loose.

## 8. Merge the lump to primary

When the plan (and optional shared run) look right, commit the lump, push, and merge to your primary branch.

The dedicated daemon fetches that branch on the next tick and starts. Recipes are already installed there from step 5.

## 9. Merge work branches

Each finished context is a branch `lump/reactToVue/<contextName>` with commit subject `LUMP: reactToVue - <contextName>`. Open a PR into the primary branch and merge as usual; if you squash or rebase, keep that `LUMP: …` line (drop it and Lumpcode treats the context as not done). Git is the record: Lumpcode scans remote history for that marker, so **toDo** means it is not on any remote ref, **branchPushed** means it is on a work branch, and **finished** means the marker is an ancestor of `origin/<primaryBranch>`. Merge the PR; the next tick skips that context and picks another.

## 10. Disable the lump

In the lump config:

```ts
disabled: true,
```

Push and merge. The next tick soft-skips it. The daemon stays up.

That's all. Thanks for reading. Next articles will cover other lump shapes. Stay tuned, and follow along at [x.com/ddyods](https://x.com/ddyods).
