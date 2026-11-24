# Requirements: Copy install prompt

| Field | Value |
| --- | --- |
| **Backlog** | `copy-install-prompt` · priority **2** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | Nothing |
| **Packages** | `@lumpcode/website` (`packages/apps/website`, CTA, runbook asset, SEO output). `.agents/skills/lumpcode` (example code block; published by `npm run publish-skills`). No CLI, core, or recipes code changes. |

## Problem statement and motivation

The install section asks the visitor to run three commands, then `lumpcode setup`, then answer its terminal questions, then write a lump, then make a second clone for a worker. A developer who already works inside Cursor, Claude Code, Copilot, Codex, or OpenCode has an agent that can do all of that. Today there is nothing to hand that agent.

The landing page documents the CLI and the skill, but the visitor still assembles the first-run path by hand. The missing piece is one copyable prompt that takes the visitor from an unmodified repo to a running dedicated worker with a real first lump.

## Goals

1. The `#install` section has a primary **Copy setup prompt** CTA. It copies a self-contained runbook verbatim and gives `Copied` feedback. The existing CLI and skill commands stay below it under **Or do it yourself**.
2. The runbook is one markdown file, committed at `packages/apps/website/app/assets/install-prompt.md`. The site also serves it at `https://www.lumpcode.com/install-prompt.md`.
3. When pasted into an agent, the runbook installs the CLI (if missing) and the Lumpcode skill, asks only blocking questions, writes `.lumpcode/templates/main.ts` (or `.js`) exporting `defineLump`, then writes a temporary smoke lump, validates it, commits and pushes, clones a sibling dedicated worker, and runs the smoke once. Only after the smoke proves the path does it write the real first lump (with validation steps), run it once, remove the smoke lump, and start the worker.
4. `defineLump` injects the default agent command, the default model, a worktree preparation hook (`postSetupWorkspaceFn`), and `openPrPostTeardown` when GitHub PRs are on. It does not inject validation.
5. The real first lump uses `retryUntilGreen` (and, when the task creates an artifact, `requireArtifactStep`) with the repo's own validation command. The public `lumpcode` skill shows the `defineLump` pattern and proposes those validation steps to the user.

## Non-goals

- A docs page or a docs sidebar entry. The runbook is an asset with a stable URL, not a docs page.
- A hero CTA, a nav change, or a third Get started URL.
- Changing `lumpcode setup`, `project-setup`, `lump-create`, `lump-plan`, `run`, `start`, or the CLI.
- Moving PR opening into the CLI. `openPrPostTeardown` stays the opt-in `@lumpcode/recipes` helper.
- Installing the user's coding agent, logging it in, or choosing its model for it.
- `retryUntilGreen` or any other validation inside `defineLump` or the smoke lump. The factory stays a thin config wrapper; the smoke only proves the path. Validation is proposed for the real lump by the skill and the runbook.
- Analytics, tracking, or a copy counter.
- Publishing the skill to `lumpcode/skills` in this ticket. Updating the source in `.agents/skills/lumpcode/` is in scope; `npm run publish-skills` is a release follow-up.
- A no-JS install path, or a prompt that requires the site to be reachable.

## Deliverables

| # | Path | Change |
| --- | --- | --- |
| 1 | `packages/apps/website/app/assets/install-prompt.md` | New runbook, the single copy source. |
| 2 | `packages/apps/website/app/pages/index.vue` | `#install` gets the primary CTA, caption, `Copied` state, and **Or do it yourself** divider above the existing snippets. |
| 3 | `packages/apps/website/seo/generateSeoFiles.ts` | Write `public/install-prompt.md` from the asset; add a `_headers` rule and an `llms.txt` Optional link. |
| 4 | `packages/apps/website/.gitignore` | Ignore the generated `public/install-prompt.md`. |
| 5 | `.agents/skills/lumpcode/SKILL.md` | New `defineLump` example, a validation-proposal subsection, and a `retryUntilGreen` lump example. |

No new npm dependency is expected. Use the existing button styles and the existing copy-feedback pattern.

## 1. Landing CTA

Place it inside the existing `.install-commands` column, above the two terminal snippets.

- Button: primary style (`.btn btn-primary`), label `Copy setup prompt`.
- Click copies the exact contents of `install-prompt.md` with `navigator.clipboard.writeText`.
- On success, the label becomes `Copied` for 1600 ms.
- On failure, the label becomes `Copy failed` for 1600 ms. Do not show `Copied` on failure.
- The button is keyboard reachable and has a stable width while the label changes (no layout shift).
- Add an `aria-live="polite"` status so the state change is announced.
- Caption under the button, one line: “Paste it into your coding agent. It installs the skill, sets up this repo and a dedicated worker clone, then proposes and runs a first lump.”
- Divider label above the existing snippets: `Or do it yourself`.
- The existing `installCliLabel`, `cliInstall`, `installSkillLabel`, `skillInstall`, and `/lumpcode` copy stay as they are.
- Section heading stays `Install the CLI.`; the left column (agents, cost note) stays as it is.
- Works in both themes using existing tokens; no hardcoded colors.

## 2. Runbook: `install-prompt.md`

Audience: the user's coding agent. Write it in the imperative, agent-agnostic, no vendor-specific tool syntax. It must be safe to paste on a normal laptop and must never assume this repo. Include the stable URL at the end: the current version is at `https://www.lumpcode.com/install-prompt.md`.

### Preconditions

Work in the current git repository root. Stop with a clear message if:

- the current directory is not a git repository root,
- there is no `origin`,
- Node.js is below 22,
- there is no supported agent CLI on `PATH` and the user cannot name one,
- the user cannot push to `origin`.

Do not continue past a failed precondition by guessing.

### Step 1: CLI

Run `lumpcode --version`. If missing, run `npm install -g @lumpcode/cli`. If the install fails (no npm, permissions), stop and print the exact command for the user to run. Report the installed version.

### Step 2: Skill

Run `npx skills add lumpcode/skills -y`. Then locate and read the installed `SKILL.md` (the installer prints its paths; common locations are `.agents/skills/lumpcode/SKILL.md`, `.claude/skills/lumpcode/SKILL.md`, `.cursor/skills/lumpcode/SKILL.md`). Follow the skill for config authoring, context sources, and validation. If the install or the read fails, fall back to the skill source at `https://github.com/lumpcode/skills` (or the docs at `https://www.lumpcode.com/llms.txt`) and continue.

### Step 3: Inspect, do not ask

Infer and report:

- the primary branch from `origin` (`git symbolic-ref refs/remotes/origin/HEAD`, or `git remote show origin`),
- the package manager from the lockfile (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`/`bun.lockb`),
- whether the repo is TypeScript (a `tsconfig.json` or `.ts` sources),
- the supported agent CLIs on `PATH` (`cursor-agent`, `copilot`, `claude`, `opencode`, `codex`),
- whether `origin` is GitHub and whether `gh auth status` succeeds,
- whether `.lumpcode/` already exists and which lumps it has.

### Step 4: Ask only these questions

Ask one at a time, with the recommended answer first.

1. **Agent tag**: use the running agent if it maps to one of the shipped tags; ask only when several are installed or none maps. If none maps, ask for the custom command module they use.
2. **Model**: ask for the model string. Suggest `auto` for cursor/copilot. For claude-code, opencode, or codex, suggest their own configured default and accept a blank answer. A blank answer means: `auto` for cursor/copilot, and omit `model` for the others.
3. **Workspace strategy**: `worktree` (recommended; enables `maxParallelRun` > 1) or `checkout` (one at a time). Explain that `worktree` needs linked worktrees to work in this repo.
4. **GitHub PRs**: ask only when `origin` is GitHub and `gh auth status` succeeds. Otherwise explain why it is skipped and continue without it. Do not install `gh` silently.
5. **Worker path**: default `../<repo-directory-name>-worker`. It must be outside the repository. Stop if the folder already exists; never delete or reuse it.
6. **Real first lump**: present 2–3 concrete, safe jobs found in this repo. Each has a name, a one-paragraph description, 1–3 contexts, and why it is low risk. The user picks one or describes their own. Do not propose destructive migrations, secrets, or work that needs credentials the user has not provided.
7. **Validation**: ask what one command proves a change in this repo is good (`npm test`, `pnpm lint`, `npm run build`, …). Suggest the obvious one from `package.json` scripts. If there is no cheap, reliable command, say so and plan a single-prompt lump instead. If the chosen task must produce a file, note that it will use `requireArtifactStep`. This is the real lump's loop, not the smoke's.

### Step 5: Project and template

If `.lumpcode/` does not exist, run `lumpcode project-setup` with the inferred primary branch and project name; it writes `.lumpcode/project.json` and a `shared` `.lumpcode/local.json`. If `.lumpcode/` exists, keep `project.json`, `local.json`, and every lump untouched, and only add what is missing.

Create `.lumpcode/templates/main.ts` (or `.js` when the repo is JavaScript) with the `defineLump` factory described below. Fill the constants from the answers and the inferred install command. The file must be committed.

### Step 6: Smoke lump

Create a temporary smoke lump named `smoke` (if that name is taken by a user lump, use `lumpcodeSmoke`). If a smoke lump from an earlier attempt already exists, repair and reuse it; never create a second one.

Create it with `lumpcode lump-create <smokeName> --config ts|js`, then rewrite the stub:

- remove the stub `baseBranch: 'main'` and the stub `command` (the template injects it),
- import `defineLump` from `../../templates/main` and export `defineLump({ ... })`,
- one static context, e.g. `[{ name: 'smoke', variables: { SMOKE_FILE: '.lumpcode/smoke.md' } }]`,
- one prompt that creates the file at `{SMOKE_FILE}` containing exactly `Lumpcode smoke test passed` and changes nothing else,
- no `retryUntilGreen` and no validation command. The smoke only proves the template, the worktree hook, the agent, the branch push, and the PR.

Run `lumpcode lump-plan <smokeName> --contexts --prompts` and fix until it passes.

Then show the plan and ask the one final confirmation: agent tag, model, primary branch, template path, smoke lump, real lump name/proposal and validation command, worker path and strategy, PRs on/off. Ask: proceed to commit/push the smoke, create the worker clone, run the smoke, then write and run the real lump, clean up the smoke, and start the worker? If the answer is no, stop here: the template and smoke are written and validated but not pushed. Print the exact commands to continue.

### Step 7: Commit and push the smoke

Show `git status`. Stage only the files this setup created or changed: `.lumpcode/project.json`, `.lumpcode/.gitignore`, `.lumpcode/templates/`, `.lumpcode/lumps/<smokeName>/`, `package.json` and its lockfile, and skill files the installer wrote into the repo when they are not ignored. Never use `git add -A`. Never stage `.lumpcode/local.json` or the user's unrelated changes. Commit and push to the origin primary branch. Do not force-push.

### Step 8: Worker clone

Clone from origin into the worker path (`git clone <origin> <workerPath>`; add `--recurse-submodules` when `.gitmodules` exists). Stop if the path exists. Install dependencies at the clone root with the repository's package manager (skip when there is no `package.json`). Write `.lumpcode/local.json`:

```json
{
  "$schema": "https://lumpcode.com/schemas/localConfig.schema.json",
  "mode": "dedicated",
  "workspaceStrategy": "worktree",
  "maxParallelRun": 1
}
```

If the user chose `checkout`, write only `mode` (omit `workspaceStrategy` and `maxParallelRun`). Do not commit this file. If the repo needs ignored env files, tell the user to copy them into the worker clone once; the template copies them into each worktree.

### Step 9: Run the smoke

In the worker clone, run `lumpcode run <smokeName>` once. This is a dedicated run: it pre-flights the clone, creates the branch, runs the context, and pushes. Verify the branch reached origin and, when GitHub PRs are on, that the PR exists (`gh pr list --head <branch> --json url`). Also verify the smoke file exists on the branch (`git fetch origin <branch>` then `git show origin/<branch>:.lumpcode/smoke.md`).

If the smoke fails, stop and report the branch, the error, and the exact command to retry. Leave the smoke lump in place for diagnosis and do not create the real lump yet.

Do not merge the smoke PR. It is closed with its branch in the cleanup step.

### Step 10: Real first lump

Create it with `lumpcode lump-create <name> --config ts|js`, then rewrite the stub:

- remove the stub `baseBranch: 'main'` and the stub `command` (the template injects it),
- import `defineLump` from `../../templates/main` and export `defineLump({ ... })`,
- use exactly one context source built from real paths in this repo, and one prompt definition,
- keep it to 1–3 contexts,
- reference real files in the prompt, and follow the repo's `AGENTS.md`, `CLAUDE.md`, and conventions when they exist,
- wrap the work in validation: `steps: retryUntilGreen({ steps: [{ promptTemplate: '…' }], validationCommandFn: () => shellCommand('<validated command>') })`,
- when the task must produce a file, use `requireArtifactStep('<VAR>')` as the validation (or chain an artifact check with the command),
- import `retryUntilGreen`, `shellCommand`, and `requireArtifactStep` from `@lumpcode/recipes` as needed.

`shellCommand` uses `sh -c`. On Windows without `sh`, use an inline `commandFn` with the appropriate executable (`cmd /c` or PowerShell) instead; the rest of the template is unchanged.

Then run `lumpcode lump-plan <name> --contexts --prompts`. Fix errors and empty contexts until it passes, and show the resolved contexts, prompts, and validation command.

### Step 11: Commit and push the real lump

Stage only the new lump directory (and any package files it needed). Never `git add -A`. Commit and push to the origin primary branch.

### Step 12: Run the real lump

In the worker clone, run `lumpcode run <name>` once. Verify the branch and, when PRs are on, the PR. If the run fails, or the validation loop reports a failure (`__VALIDATION_FAILED__`), stop and report; the branch may still be pushed, so tell the user to review it, fix the lump, and re-run. Keep the smoke and do not start the worker.

### Step 13: Clean up the smoke

Only after the real run succeeded. Remove the smoke from the primary **before** deleting its branch, so no worker can rediscover it:

- remove `.lumpcode/lumps/<smokeName>/` from the primary; if the smoke PR was merged, also remove `.lumpcode/smoke.md`,
- stage only those paths, commit, and push to the origin primary branch,
- then close the smoke PR and delete its branch (`gh pr close <branch> --delete-branch`), or delete the remote branch directly when there is no PR (`git push origin --delete <branch>`),
- verify the smoke branch is gone from origin and the smoke lump is absent from the primary.

If the real run failed, do not clean up the smoke. Report its branch and leave it for diagnosis.

### Step 14: Start the worker

Run `lumpcode start` in the worker clone and verify with `lumpcode daemon-status`. Report the daemon status. If `start` fails, report the exact error and the command to retry.

### Step 15: Final report

Report, in plain text:

- CLI version, agent tag, model,
- primary branch, template path, real lump name and config path, discovered contexts, validation command,
- worker path and workspace strategy, PRs on/off,
- smoke result: branch, PR, and that it was closed and removed,
- real-run branch and PR URL (or why there is none),
- worker running (daemon status),
- how to watch: `lumpcode daemon-status`, `lumpcode dashboard`, `lumpcode transcript --lumpName <name>`,
- the next changes to make (edit the lump, push, merge the branches).

## 3. `defineLump` contract

Path: `.lumpcode/templates/main.ts` (or `.lumpcode/templates/main.js` for a JavaScript repo). Export a named function:

```ts
export function defineLump(config) { ... }
```

A lump imports it:

```ts
import { defineLump } from '../../templates/main'

export default defineLump({
  contextListJson: { FILE: 'src/{NAME}.ts' },
  prompt: { promptTemplate: 'Improve @{FILE}.' },
})
```

The factory must:

1. Default `command` to the chosen agent tag. A caller's `config.command` wins.
2. Default `lumpVariables` to the chosen model. Merge per-lump `lumpVariables` over the default, so a lump can override the model without losing the rest.
3. Set a `postSetupWorkspaceFn` unless the caller supplied one (or a `postSetupWorkspaceCommand`). The hook:
   - does nothing unless `workspaceStrategy === 'worktree'`,
   - copies `.env` and `.env.*` files from `projectRoot` into `workspacePath` at the same relative paths, creating directories and never overwriting an existing file; skip `node_modules`, `.git`, `.worktrees`, and `.lumpcode`,
   - returns `{ command: INSTALL_COMMAND }` (the inferred install command) when the repo has a `package.json`, otherwise returns nothing,
   - never runs a git mutation.
4. Set `postTeardownWorkspaceFn: openPrPostTeardown({ provider: 'github' })` when GitHub PRs are on, unless the caller supplied one (or a `postTeardownWorkspaceCommand`). When PRs are off, leave it unset and add a comment with the one-line change to turn it on.

Reference shape (adapt names/types to the repo; the skill example is the canonical short form):

```ts
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

import {
  defineConfig,
  type LumpJsConfig,
  type LumpVariables,
  type PostSetupWorkspaceFn,
  type StepVariables,
} from '@lumpcode/cli-utils'
import { openPrPostTeardown } from '@lumpcode/recipes'

const COMMAND = 'cursor'
const MODEL = 'auto'
const INSTALL_COMMAND = 'npm ci'
const OPEN_PR = true

function copyEnvFiles(projectRoot: string, workspacePath: string): void {
  const skip = new Set(['node_modules', '.git', '.worktrees', '.lumpcode'])
  const walk = (relative: string): void => {
    for (const entry of readdirSync(join(projectRoot, relative), { withFileTypes: true })) {
      if (skip.has(entry.name)) continue
      const child = relative === '' ? entry.name : `${relative}/${entry.name}`
      if (entry.isDirectory()) {
        walk(child)
        continue
      }
      if (entry.name !== '.env' && !entry.name.startsWith('.env.')) continue
      const destination = join(workspacePath, child)
      if (existsSync(destination)) continue
      mkdirSync(dirname(destination), { recursive: true })
      copyFileSync(join(projectRoot, child), destination)
    }
  }
  walk('')
}

const prepareWorktree: PostSetupWorkspaceFn = (input) => {
  if (input.workspaceStrategy !== 'worktree') return
  copyEnvFiles(input.projectRoot, input.workspacePath)
  return INSTALL_COMMAND === '' ? undefined : { command: INSTALL_COMMAND }
}

export function defineLump<
  V extends LumpVariables = LumpVariables,
  SV extends StepVariables = StepVariables,
>(config: LumpJsConfig<V, SV>): LumpJsConfig<V, SV> {
  const setup =
    config.postSetupWorkspaceCommand !== undefined
      ? {}
      : { postSetupWorkspaceFn: config.postSetupWorkspaceFn ?? prepareWorktree }
  const teardown =
    config.postTeardownWorkspaceCommand !== undefined
      ? {}
      : {
          postTeardownWorkspaceFn:
            config.postTeardownWorkspaceFn ??
            (OPEN_PR ? openPrPostTeardown({ provider: 'github' }) : undefined),
        }
  return defineConfig<V, SV>({
    command: COMMAND,
    ...config,
    lumpVariables: { model: MODEL, ...config.lumpVariables } as V,
    ...setup,
    ...teardown,
  })
}
```

The install command is inferred: `package-lock.json` → `npm ci`, `pnpm-lock.yaml` → `pnpm install`, `yarn.lock` → `yarn install`, `bun.lock`/`bun.lockb` → `bun install`. No `package.json` → `INSTALL_COMMAND = ''`.

`MODEL` is the answer from the runbook. If the user leaves it blank for a non-cursor/copilot agent, omit the `lumpVariables` default and add a comment.

The worktree strategy itself stays in the worker clone's `.lumpcode/local.json`; `defineLump` only prepares the worktree once the CLI has created it.

Validation is not part of the factory. Each lump declares its own steps; the real first lump wraps them in `retryUntilGreen`/`requireArtifactStep` as described in section 4.

## 4. First lump and validation

One real, repo-specific lump, 1–3 contexts. It must be safe enough to run on a first day: no secrets, no destructive migration, no bulk rewrite that cannot be reviewed. It must follow the repo's own conventions and reference real files.

The real lump carries the validation, not the smoke:

- wrap the work in `retryUntilGreen` with the user's validation command (`validationCommandFn: () => shellCommand('<command>')`), so a failed check feeds the output back and retries;
- when the task must produce a file, use `requireArtifactStep('<VAR>')` as the validation, or chain the artifact check with the command;
- if there is no cheap, reliable command, say so and use a single prompt; do not invent a command that would make the loop meaningless.

`lump-plan` must pass and show the contexts and validation. The first `lumpcode run` in the worker clone must push a branch (and a PR when opted in).

## 5. Smoke and worker order

The smoke lump is temporary. The order is: template + smoke → push → clone the worker → run the smoke once → write the real lump → push → run the real lump once → remove the smoke lump and close/delete its branch → start the worker. The worker clone is a sibling clone from origin, never the user's working clone, and it is the only clone that gets `mode: "dedicated"`. The main clone stays `shared` (or whatever it already was). `maxParallelRun` stays `1` for the first runs; the user can raise it later.

If the smoke fails, keep it and stop. If the real run fails, keep the smoke for diagnosis and do not start the worker. Only a successful real run triggers the smoke cleanup.

## 6. Safety

- The main clone is never switched to `dedicated`, never hard-reset, never cleaned.
- Never force-push, never `git reset --hard`, never `git clean`, never `git add -A`.
- Never overwrite an existing `.lumpcode/`, lump, template, or worker folder.
- Never commit `.lumpcode/local.json` (it is gitignored).
- Retry fixable local failures (config edits, `lump-plan` errors, dependency install). Stop before push/run/start on an unresolved failure and print the exact command to resume.
- Do not put secrets in the runbook, the template, or the lump config.
- Existing `.lumpcode/`: additive. Keep everything; still propose a new lump when the user runs the prompt again.
- Reference the remote as the user's git remote in prose; do not assume branch names beyond the inferred primary.

## 7. Skill example and validation proposal

Add a section to `.agents/skills/lumpcode/SKILL.md`, after the lump-authoring steps and before `Config essentials`, titled `A shared defineLump for your repo`. It contains:

- one short paragraph: when the user wants every lump to share a command, a model, worktree preparation, and optional PR opening, put the factory at `.lumpcode/templates/main.ts` (or `.js`),
- one fenced `config.ts` block with the factory (short form: defaults, merge, `postSetupWorkspaceFn` hook stub, `openPrPostTeardown`),
- one fenced block showing a lump importing `defineLump`, passing a context source, and wrapping the prompt in `retryUntilGreen` with `shellCommand`,
- the caveat: worktree selection is `local.json`; the hook only prepares a worktree; PR opening needs `gh`; plain `defineConfig` still works.

Then add a short `Propose validation` subsection (same section or just after it) that tells the agent to **propose** validation to the user rather than adding it silently:

- `retryUntilGreen` when the agent edits code and a command can prove the result (`npm test`, `npm run lint`, `npm run build`);
- `requireArtifactStep` when the context must produce a file (requirements, a report, a generated doc);
- `getValidationLoopSteps` only when the default loop shape does not fit;
- say what the command costs and what happens on failure (`pushOnValidationFailure` defaults to pushing; a failed check is reported in `lumpVariables.__VALIDATION_FAILED__`).

Keep the skill's existing rules intact: one context source, one prompt definition, `lump-plan` before running, and no running a lump unless asked. The example and the validation guidance are additive; the factory itself does not impose a validation loop.

Publishing the updated skill to `lumpcode/skills` (`npm run publish-skills`) is a follow-up, not part of this ticket's validation.

## 8. Stable URL

`packages/apps/website/seo/generateSeoFiles.ts` reads `app/assets/install-prompt.md` and writes:

- `public/install-prompt.md` with the same content and a trailing newline,
- a `_headers` rule:
  ```
  /install-prompt.md
    Content-Type: text/markdown; charset=utf-8
  ```
- an `llms.txt` Optional entry linking `https://www.lumpcode.com/install-prompt.md` with a one-line description.

Add `public/install-prompt.md` to `packages/apps/website/.gitignore`. No sitemap entry, no canonical link (it is not an HTML page).

## Acceptance criteria

1. In `npm run website`, the `#install` section shows the primary `Copy setup prompt` button, the caption, and the **Or do it yourself** divider above the two existing snippets. Clicking copies exactly the asset text; the label shows `Copied` for about 1.6 s and returns. A blocked clipboard shows `Copy failed`, not `Copied`. The button is keyboard reachable and does not shift layout.
2. The CTA and the panel look correct in light and dark themes, and on a narrow viewport.
3. `npm run generate -w=@lumpcode/website` succeeds. After it, `packages/apps/website/public/install-prompt.md` exists with the asset text, `_headers` has the markdown rule, and `llms.txt` links the prompt. The public copy is gitignored.
4. The runbook is self-contained, agent-agnostic, and contains every step in section 2, including the seven questions and the single final confirmation. A dry run on a scratch git repo (no real agent run, no real push) reaches a green `lumpcode lump-plan <smokeName> --contexts --prompts` and a green `lumpcode lump-plan <name> --contexts --prompts` using the generated `.lumpcode/templates/main.ts`. The smoke has one context and no `retryUntilGreen`; the real lump has the validation command. The template's hook is exercised only with `workspaceStrategy: 'worktree'` and makes no git changes.
5. `defineLump` injects the command, merges the model, prepares a worktree (env copy + install), and applies `openPrPostTeardown` when enabled. A lump config that overrides `lumpVariables` keeps the rest of the defaults. The factory does not inject validation.
6. The real lump wraps its prompt in `retryUntilGreen` with `shellCommand('<validated command>')`, or uses `requireArtifactStep` when the task produces a file. A failing validation surfaces the command output and retries; the command comes from the user's answer, not a hardcoded default.
7. `.agents/skills/lumpcode/SKILL.md` contains the new `defineLump` section, the `retryUntilGreen` lump example, and the validation-proposal guidance; the skill still states the one-context-source / one-prompt / `lump-plan` rules.
8. The smoke is temporary: it runs before the real lump, its branch/PR is closed and deleted, and the smoke lump is removed from the primary after a successful real run. If the smoke fails or the real run fails, the smoke is left in place for diagnosis.
9. No docs page, docs sidebar entry, nav link, or hero change is introduced. The existing CLI and skill snippets still render and copy.

## Out of scope / follow-ups

- Publishing the updated skill with `npm run publish-skills`.
- A docs page for the agent setup path.
- Analytics on the CTA.
- Any CLI flag or recipe change.
- A no-JS version of the CTA.
