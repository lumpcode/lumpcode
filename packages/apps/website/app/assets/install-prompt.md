# Set up Lumpcode and a dedicated worker

You are the coding agent in this session. Work in the current git repository and take it from an unmodified tree to a running dedicated worker with one real lump. The setup reaches the primary branch through a pull request the user merges. You never push to the primary branch. Do the steps in order. Ask the questions in step 4 one at a time, with the recommended answer first. Stop at the first failed precondition or unresolved failure. Say what failed and print the exact command to continue. Do not guess, and do not continue past that stop.

Do not install a coding agent, log one in, or choose its model except by the answer below. Do not install `gh`. Do not assume a branch name until you have inferred the primary branch. In commands, the user's git remote is the remote named `origin`.

This prompt does not need the website after you have read it. The steps below are the whole runbook.

## Preconditions

Work at the repository root. Stop with a clear message if any of these fail. Do not pick a fallback and continue.

- The current directory is the git repository root. `git rev-parse --show-toplevel` must be this directory. If it is not a git repository, or you are in a subdirectory, stop.
- `origin` exists. `git remote get-url origin` must print a URL. If there is no `origin`, stop.
- Node.js is 22 or newer. `node -p "Number(process.versions.node.split('.')[0])"` must be at least 22. If `node` is missing or older, stop and print the version you found.
- A supported agent CLI is on `PATH`, or the user can name the command module they use. Look for `cursor-agent`, `copilot`, `claude`, `opencode`, and `codex` (`command -v` each). If none are on `PATH` and the user cannot name one, stop.
- The user can push a new branch to `origin`. Ask them. Also run `git ls-remote --heads origin`. If they cannot push a branch, or the remote is unreachable, stop. Push access to the primary branch is not needed.

## Step 1: CLI

Run `lumpcode --version`.

If the command is missing, run `npm install -g @lumpcode/cli`. If that fails (no npm, or permissions), stop and print this exact command for the user to run:

```bash
npm install -g @lumpcode/cli
```

Report the installed version before you continue.

## Step 2: Skill

Run:

```bash
npx skills add lumpcode/skills -y
```

The installer prints the paths it wrote. Read the installed `SKILL.md`. Common locations are `.agents/skills/lumpcode/SKILL.md`, `.claude/skills/lumpcode/SKILL.md`, and `.cursor/skills/lumpcode/SKILL.md`. Follow that skill for config authoring, context sources, and validation.

If the install or the read fails, read the skill source at `https://github.com/lumpcode/skills` or the docs at `https://www.lumpcode.com/llms.txt`, and continue.

## Step 3: Inspect, do not ask

Infer the facts below and report them. Do not ask the user for something you can read from the repo.

- Primary branch from `origin`. Prefer `git symbolic-ref refs/remotes/origin/HEAD`. If that ref is missing, use `git remote show origin` and read the HEAD branch. This is the only branch name you assume after this step.
- Package manager from the lockfile. `package-lock.json` → npm. `pnpm-lock.yaml` → pnpm. `yarn.lock` → yarn. `bun.lock` or `bun.lockb` → bun. If more than one lockfile exists, stop and ask which package manager to use. If `package.json` exists and there is no lockfile, use npm. If there is no `package.json`, there is no install command.
- Whether the repo is TypeScript: a `tsconfig.json` or any `.ts` source. Otherwise treat it as JavaScript.
- Supported agent CLIs on `PATH`: `cursor-agent`, `copilot`, `claude`, `opencode`, `codex`.
- Whether `origin` is GitHub (the URL host is `github.com`) and whether `gh auth status` succeeds. Do not install `gh` if it is missing. A missing `gh` or a failed auth means GitHub pull requests are off.
- Whether `.lumpcode/` already exists, and the lump names under `.lumpcode/lumps/` if it does.
- The branch checked out now (`git branch --show-current`). You return to it in step 10.
- Whether a `lumpcode/setup` branch already exists locally or on `origin` (`git ls-remote --heads origin lumpcode/setup`). If it does, it is from an earlier attempt. Ask whether to continue on it or to stop. Never delete it yourself.

Install command for worktrees, from that same inference:

| Lockfile | `INSTALL_COMMAND` |
| --- | --- |
| `package-lock.json` | `npm ci` |
| `pnpm-lock.yaml` | `pnpm install` |
| `yarn.lock` | `yarn install` |
| `bun.lock` or `bun.lockb` | `bun install` |
| `package.json` and no lockfile | `npm install` |
| no `package.json` | empty |

## Step 4: Ask only these questions

Ask one at a time. Put the recommended answer first. Wait for the answer before the next question. These are the only questions before the final confirmation in step 6.

1. **Agent tag.** Map the binary to the shipped tag: `cursor-agent` → `cursor`, `copilot` → `copilot`, `claude` → `claude-code`, `opencode` → `opencode`, `codex` → `codex`. If the running agent maps to one of those tags and it is the only match installed, use it and say so. Ask only when several are installed or none maps. If none maps, ask for the custom command module they use. If they cannot name one, stop.
2. **Model.** Ask for the model string. Suggest `auto` for `cursor` and `copilot`. For `claude-code`, `opencode`, or `codex`, suggest the default they already configured, and accept a blank answer. A blank answer means `auto` for `cursor` and `copilot`, and omit `model` for the others.
3. **Workspace strategy.** `worktree` (recommended; this is what allows `maxParallelRun` greater than 1 later) or `checkout` (one lump run at a time). Say that `worktree` needs linked worktrees to work in this repo.
4. **GitHub PRs.** Ask only when `origin` is GitHub and `gh auth status` succeeds. Otherwise explain why this question is skipped and continue with pull requests off. Do not install `gh`.
5. **Worker path.** Recommend `../<repo-directory-name>-worker`, using the repository directory's name. It must be outside this repository. Stop if that folder already exists. Never delete it and never reuse it.
6. **Real first lump.** Present 2 or 3 concrete, safe jobs you found in this repo. Each one has a name, a one-paragraph description, 1 to 3 contexts, and why it is low risk. The user picks one or describes their own. Do not propose a destructive migration, secrets, or work that needs credentials the user has not given you.
7. **Validation.** Ask which one command proves a change in this repo is good (`npm test`, `pnpm lint`, `npm run build`, or whatever this repo actually uses). Suggest the obvious script from `package.json`. If there is no cheap, reliable command, say so and plan a single-prompt lump instead. If the chosen task must produce a file, say that the real lump will use `requireArtifactStep`. This command is the real lump's loop.

## Step 5: Project and template

If `.lumpcode/` does not exist, run `lumpcode project-setup` with the inferred primary branch and a project name (letters, digits, underscores, and hyphens). Example:

```bash
lumpcode project-setup --primaryBranch <primary> --projectName <name>
```

That writes `.lumpcode/project.json` and a `shared` `.lumpcode/local.json`. If `.lumpcode/` already exists, do not run `project-setup`. Keep `project.json`, `local.json`, and every lump untouched, and only add files that are missing.

Install the authoring packages so the template can load, with the package manager from step 3:

```bash
npm install --save-dev @lumpcode/cli-utils @lumpcode/recipes
```

Use `pnpm add -D`, `yarn add -D`, or `bun add -d` when that is the package manager. If the repo had no `package.json`, you may create one for these two packages, and you still leave `INSTALL_COMMAND` empty so worktrees do not get an install command.

Create `.lumpcode/templates/main.ts` when the repo is TypeScript, or `.lumpcode/templates/main.js` when it is JavaScript. If that file already exists, keep it. Do not overwrite a template, a lump, or `.lumpcode/` itself. For JavaScript, use the same factory with the type imports and type annotations removed.

Fill `COMMAND`, `MODEL`, `INSTALL_COMMAND`, and `OPEN_PR` from the answers and from step 3. `COMMAND` is the agent tag. `MODEL` is the model string. When the user left model blank for `claude-code`, `opencode`, or `codex`, omit the `lumpVariables` default (do not set `model`) and add a comment that the agent preset uses its own default. `OPEN_PR` is true only when they opted into GitHub pull requests.

`defineLump` injects the command, merges the model, prepares a worktree, and applies `openPrPostTeardown` when pull requests are on. It does not inject validation. A caller's `config.command` wins. Per-lump `lumpVariables` merge over the default so a lump can override the model and keep the rest. The worktree strategy itself stays in the worker clone's `.lumpcode/local.json`. This factory only prepares a worktree after the CLI has created it.

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

When `OPEN_PR` is false, `postTeardownWorkspaceFn` stays unset. The one-line change to turn pull requests on is `const OPEN_PR = true`. The hook returns nothing unless `workspaceStrategy` is `worktree`. It copies `.env` and `.env.*` from `projectRoot` into `workspacePath` at the same relative paths, creates directories, and never overwrites an existing file. It skips `node_modules`, `.git`, `.worktrees`, and `.lumpcode`. It never runs a git command. When `INSTALL_COMMAND` is empty it returns nothing after the copy. Otherwise it returns `{ command: INSTALL_COMMAND }`.

The template file must be committed. That commit happens on the setup branch in step 7, after the real lump's plan passes.

## Step 6: Real first lump

Create it with `lumpcode lump-create <name> --config ts` or `--config js`, matching the template. Rewrite the stub:

- Remove the stub `baseBranch: 'main'` and the stub `command`. The template injects the command.
- Import `defineLump` from `../../templates/main` and export `defineLump({ ... })`.
- Use exactly one context source built from real paths in this repo, and one prompt definition.
- Keep it to 1 to 3 contexts.
- Reference real files in the prompt. Follow the repo's `AGENTS.md`, `CLAUDE.md`, and conventions when they exist.
- Wrap the work in the validation the user confirmed. The command comes from their answer, not from a default you invent.

```ts
import { defineLump } from '../../templates/main'
import { retryUntilGreen, shellCommand } from '@lumpcode/recipes'

export default defineLump({
  contextListJson: { FILE: 'src/{NAME}.ts' },
  steps: retryUntilGreen({
    steps: [{ promptTemplate: 'Improve @{FILE}.' }],
    validationCommandFn: () => shellCommand('<the command the user confirmed>'),
  }),
})
```

When the task must produce a file, use `requireArtifactStep('<VAR>')` as `validationCommandFn`. When a command must pass as well, use `shellCommand` with a script that checks the artifact and then runs the command. If there is no cheap, reliable command, say so and use a single prompt. Do not invent a command that would make the loop meaningless.

`shellCommand` uses `sh -c`. On Windows without `sh`, use an inline `commandFn` with the appropriate executable (`cmd /c` or PowerShell) instead. The rest of the template stays the same.

Import `retryUntilGreen`, `shellCommand`, and `requireArtifactStep` from `@lumpcode/recipes` only as needed.

Run:

```bash
lumpcode lump-plan <name> --contexts --prompts
```

Fix errors and empty contexts until it passes. Show the resolved contexts, the prompts, and the validation command.

Then ask the one final confirmation. List the agent tag, model, primary branch, template path, real lump name and proposal, validation command, worker path, workspace strategy, and whether pull requests are on. Ask:

> Proceed to commit the setup on a `lumpcode/setup` branch and push that branch, create the worker clone, test the lump there without pushing anything, and open the setup pull request for you to merge?

If the answer is no, stop here. The template and the lump are written and validated, and nothing is committed or pushed. Print the exact commands to continue.

## Step 7: Setup branch

Create the setup branch from the current state. Uncommitted work the user already had comes along untouched, and it is never staged.

```bash
git switch -c lumpcode/setup
```

Show `git status`. Stage only the files this setup created or changed:

- `.lumpcode/project.json`
- `.lumpcode/.gitignore`
- `.lumpcode/templates/`
- `.lumpcode/lumps/<name>/`
- `package.json` and its lockfile
- skill files the installer wrote into the repo, when they are not ignored

Never use `git add -A`. Never stage `.lumpcode/local.json`. Never stage the user's unrelated changes. Commit with the message `Set up Lumpcode`, then push the setup branch, never the primary branch:

```bash
git push -u origin lumpcode/setup
```

Do not force-push. If the push fails, stop and print that command. Do not hard-reset, clean, or rewrite history. Stay on `lumpcode/setup` until step 10, so fixes in step 9 land on the same branch.

## Step 8: Worker clone

Clone the setup branch from the user's git remote into the worker path. Stop if the path exists.

```bash
git clone --branch lumpcode/setup <origin-url> <workerPath>
```

Add `--recurse-submodules` when `.gitmodules` exists. Install dependencies at the clone root with the repository's package manager. Skip that install when there is no `package.json`.

If the repo needs ignored env files, tell the user to copy them into the worker clone once. The template copies them into each worktree later.

For the test run, write `.lumpcode/local.json` in the worker clone in `shared` mode. Do not commit this file. It is gitignored.

```json
{
  "$schema": "https://lumpcode.com/schemas/localConfig.schema.json",
  "mode": "shared"
}
```

The main clone stays `shared`, or whatever mode it already had. Never switch the main clone to `dedicated`.

## Step 9: Test the lump in the worker clone

In the worker clone, run the lump once:

```bash
lumpcode run <name> --json
```

In `shared` mode the agent works in place on `lumpcode/setup` in the worker clone. Nothing is committed and nothing is pushed. `--json` skips the interactive commit prompt. Then check:

- The run succeeded, and the validation loop did not report a failure (`lumpVariables.__VALIDATION_FAILED__`).
- `git status` and `git diff` in the worker clone show the change you expected. Show the user a short summary of that diff.

If the run fails or the change is wrong, fix the lump in the main clone, run `lumpcode lump-plan <name> --contexts --prompts` again, commit the fix to `lumpcode/setup`, and push it. In the worker clone, discard the test changes as below, run `git pull`, and run the lump again. Stop after three failed attempts and report the error and the exact command to retry.

When the test passes, discard its changes in the worker clone only. Run `git restore --staged --worktree -- .`, then delete each untracked path that `git status --porcelain` lists as `??`. The worker clone must end with a clean `git status` on `lumpcode/setup`. Never discard anything in the main clone.

The real branch and pull request for this work come from the worker after the merge.

## Step 10: Setup pull request

Open the setup pull request against the primary branch. When `gh auth status` succeeded:

```bash
gh pr create --base <primary> --head lumpcode/setup --title "Set up Lumpcode" --body "<summary>"
```

The body lists the template, the lump and its contexts, the validation command, and the test-run result. Without `gh`, print the compare URL for a GitHub `origin` (`https://github.com/<owner>/<repo>/compare/<primary>...lumpcode/setup`). For another host, tell the user to open a pull or merge request from `lumpcode/setup` into `<primary>`.

Switch the main clone back to the branch it was on in step 3 (`git switch <startBranch>`). The user's uncommitted work comes back with it.

Never merge the setup pull request yourself. Ask the user to review and merge it, then to tell you when it is merged. If they will merge later, stop here and print the step 11 commands for them to run after the merge.

## Step 11: Start the worker

After the user says it is merged, verify that the lump is on the primary branch. A check by file, rather than by commit, also works for a squash merge:

```bash
git fetch origin <primary>
git cat-file -e origin/<primary>:.lumpcode/lumps/<name>/config.ts
```

Use the lump's real config file name (`config.ts` or `config.js`). If the check fails, the pull request is not merged yet. Stop and say so.

In the worker clone, move to the primary branch:

```bash
git fetch origin
git switch <primary>
```

Install dependencies again when `package.json` exists. Then rewrite the worker clone's `.lumpcode/local.json` for `dedicated` mode. For `worktree`:

```json
{
  "$schema": "https://lumpcode.com/schemas/localConfig.schema.json",
  "mode": "dedicated",
  "workspaceStrategy": "worktree",
  "maxParallelRun": 1
}
```

If the user chose `checkout`, write only `mode` (omit `workspaceStrategy` and `maxParallelRun`):

```json
{
  "$schema": "https://lumpcode.com/schemas/localConfig.schema.json",
  "mode": "dedicated"
}
```

`maxParallelRun` stays `1` for the first runs. The user can raise it later.

In the worker clone, run `lumpcode start`. Verify with `lumpcode daemon-status`. Report the daemon status. If `start` fails, report the exact error and the command to retry. The worker's first pass runs the lump, pushes a `lump/<name>/…` branch, and opens a pull request when pull requests are on.

If `lumpcode/setup` is still on `origin` after the merge, delete it with `git push origin --delete lumpcode/setup`.

## Step 12: Final report

Report, in plain text:

- CLI version, agent tag, and model
- Primary branch, template path, real lump name and config path, discovered contexts, and validation command
- Worker path, workspace strategy, and whether pull requests are on
- Test-run result in the worker clone, and that its changes were discarded
- Setup pull request URL and whether it is merged
- Worker running (daemon status), or the step 11 commands to run after the merge
- How to watch: `lumpcode daemon-status`, `lumpcode dashboard`, `lumpcode transcript --lumpName <name>`
- The next changes to make: edit the lump, push, and merge the branches

## Safety

- Never push to the primary branch. Setup changes reach it only through the setup pull request, and the user merges it.
- The main clone is never switched to `dedicated`, never hard-reset, and never cleaned.
- Never force-push. Never `git reset --hard`. Never `git clean`. Never `git add -A`.
- Never overwrite an existing `.lumpcode/`, lump, template, or worker folder.
- Never commit `.lumpcode/local.json`.
- Retry fixable local failures (config edits, `lump-plan` errors, dependency install). Stop before push, run, or start on an unresolved failure, and print the exact command to resume.
- Do not put secrets in the template or the lump config.
- An existing `.lumpcode/` is additive. Keep everything. Still propose a new lump when the user runs this prompt again.
- The worker clone is a sibling clone from the user's git remote, never the user's working clone. It runs `shared` only for the test in step 9, and it is the only clone that gets `mode: "dedicated"`.

The current version of this prompt is at `https://www.lumpcode.com/install-prompt.md`.
