# Requirements: `lumpcode setup` first-run drive

| Field | Value |
| --- | --- |
| **Backlog** | `setup-first-pr-drive` · priority **1** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | `scaffold-lumpcode-project`, `exact-path-context-list-json` |
| **Packages** | Primary: `@lumpcode/cli` (`commands/setup`, `main.ts`, `commands/index.ts`, DOCS). Also: `packages/apps/website` First PR + commands. Core / recipes / `cli-types` / `cli-utils` unchanged (consume existing APIs). |

## Problem statement and motivation

First-run docs are still a multi-command tutorial. Shared `run` is already in-place on this branch. This ticket is the new-repo shared JSON happy path through that `run`.

1. No registered `setup` command.
2. Operators still run `project-setup`, `lump-create`, edit, `lump-plan`, `run` by hand.

## Goals

1. `lumpcode setup [--projectPath]` is registered and TTY-gated.
2. Fresh shared JSON drive: preflight → optional skill → scaffold → command choice → JSON stub → edit pause → commit/push → plan → in-place `run`.
3. Success prints the current branch (not `lump/…`) and does not open a PR.
4. First PR / get-started / commands docs use `setup` as the happy path.

## Non-goals

- Resume when `.lumpcode/` exists (next ticket).
- Dedicated `start` / `launchStartDaemon` (next ticket). Shared never starts a daemon here either.
- js/ts stubs and authoring-pkg install (later ticket). This ticket’s format prompt may list `js` / `ts` but only **writes JSON**.
- Suggesting or creating a git branch.
- Opening a PR.
- `--yes` / `--mode` / `--lumpName`.
- Importing `commands/*/main`.
- Re-implementing dirty/detached checks (`assertSourceWorkTreeClean` inside `run`).

## User stories / use cases

1. As a developer on a feature branch — I run `lumpcode setup` in a git repo with no `.lumpcode/`, pick shared + JSON + README, accept CLI commit+push, confirm run, so the agent commits on this branch.
2. As CI — I call `project-setup --mode shared`. `setup` without a TTY (or with `--json`) fails and points at `project-setup`.
3. As a custom-agent user — no preset on `PATH`. After `.lumpcode/commands/` exists, I paste a tag until `getCommandPath` hits.

## Proposed behavior and UX

```text
lumpcode setup [--projectPath <dir>]
```

| Gate | Failure |
| --- | --- |
| `stdin` is not a TTY | Use `project-setup` for non-interactive init |
| Global `--json` | `setup` is interactive |
| `--projectPath` | Resolve that dir, then `git rev-parse --show-toplevel` as `projectRoot` |

`project-setup` stays registered.

### Command module

`packages/apps/cli/src/commands/setup/` (`main.ts`, `index.ts`, tests). Export from `commands/index.ts`. `main.ts` injections: optional `isInteractive` / `prompter` (same empty-object pattern as `projectSetup` unless tests inject).

```ts
type Output = {
  messages: string[];
  data?: { projectRoot: string; lumpName?: string; branchName?: string };
};

type SetupPrompter = {
  confirm(input: { message: string; defaultValue: boolean }): Promise<boolean>;
  select(input: { message: string; choices: { value: string; label: string }[] }): Promise<string>;
  input(input: { message: string; defaultValue?: string }): Promise<string>;
  pause(input: { message: string }): Promise<void>;
};
```

Do not import `commands/*/main`. Call `scaffoldLumpcodeProject`, `resolveInferredProjectName`, `getCommandPath`, `getCodeBasePaths`, `planLumpFromJsConfig`, `installRunAbortHandlers`, `runLumpFromLumpName`.

### Step spine (this ticket)

| Id | When | Behavior |
| --- | --- | --- |
| `preflight` | always | Hard-fail. Table below. |
| `installSkill` | always | Confirm, default yes. Yes → `npx skills add lumpcode/skills` at `projectRoot`. Failure → warn, continue. |
| `localConfig` | no `.lumpcode/` | Fresh write via `scaffoldLumpcodeProject`. |
| `configFormat` | skip | Always write JSON in this ticket. The later ticket adds the `json` \| `js` \| `ts` prompt. |
| `chooseCommand` | no lump config | Table below. |
| `lumpName` | no lump config | Default `myFirstLump`. `assertValidLumpName`. If that lump already has a config, ask another name. |
| JSON stub | no lump config | See stubs. |
| `editLump` | after a lump path exists | Print config path. `pause` (Enter). No `$EDITOR`. No plan here. |
| `commitPush` | always | `cli` (default) or `manual`. |
| `run` | always | Plan → confirm → `runLumpFromLumpName`. |
| `start` | skip | Print `https://www.lumpcode.com/docs/start/worker`. Do not call `launchStartDaemon`. |

### `preflight`

| Check | Probe |
| --- | --- |
| Git work tree | `git rev-parse --show-toplevel`. Not a work tree → fail (same idea as `project-setup`). |
| `origin` | `git remote get-url origin` |
| Origin reachable | `git ls-remote --heads origin` |
| Identity | non-empty `git config user.name` and `user.email` |
| Agents | which of `cursor-agent`, `copilot`, `claude`, `opencode`, `codex` are on `PATH` (tags `cursor`, `copilot`, `claude-code`, `opencode`, `codex`) |

Do not probe push. Empty agent list is OK. Do not check `primaryBranch` until chosen. Do not suggest a branch.

### Fresh `localConfig`

| File | Fields |
| --- | --- |
| `project.json` | `projectName` via `resolveInferredProjectName`; confirm. `primaryBranch` infer `origin/HEAD` then current branch (not hardcoded `main`); confirm. Then `ls-remote` must list that branch. |
| `local.json` | `mode` (default `shared`). Ask `workspaceStrategy` **only if mode is dedicated** (default `checkout`). Dedicated → extra confirm that `run` resets **this** checkout. `maxParallelRun` only if `worktree`; omit key when `1`. Shared: write `{ mode: "shared" }` only. |
| gitignore + dirs | Via `scaffoldLumpcodeProject`. |

Do not write `command`, `keepHistory`, `verbose`, `refreshCommand`, `disabled`, or `primaryBranches`.

If `.lumpcode/` already exists, this ticket may fail-closed with a short “already initialized” message (resume is the next ticket). `project-setup` still refuses that tree.

### `chooseCommand`

| `agentsOnPath` | Prompt |
| --- | --- |
| `[]` | Print `https://www.lumpcode.com/docs/author/agents`. Ask for a tag. Retry until `getCommandPath(tag)` returns a file (project `.lumpcode/commands/<tag>.ts\|.js` or global). |
| one preset | Confirm that tag; offer custom (same wait). |
| several | Select one; same custom escape. |

Chosen tag is the first lump’s `prompt.command`. Not written on `project.json`.

### JSON stub

```ts
contextListJson: { FILE: string }  // exact relative path
prompt: { promptTemplate: 'clean and improve the code in @{FILE}'; command: string }
```

No `baseBranch`. No `defineConfig` / recipe imports.

Default path `README.md` if that file exists at repo root. Else ask for one existing file (default: first `getCodeBasePaths` file whose exact-path context name is legal).

Exact-path context name: basename with the final `.[^/.]+` stripped. Must match `^[a-zA-Z0-9_-]+$`. Refuse the file if not.

### `commitPush`

| Choice | Behavior |
| --- | --- |
| `cli` (default) | `git add` only the allowlist. Subject `Add Lumpcode setup and <lumpName>` (not a `LUMP:` marker). `git push -u origin HEAD`. |
| `manual` | Print the same commands. `pause`. Do not verify they pushed. |

Add only if the path exists: `.gitignore`, `.lumpcode/project.json`, `.lumpcode/lumps/`, `.lumpcode/commands/`, `package.json`, `package-lock.json`. Never `local.json` or `node_modules/`. Never the rest of a dirty tree.

No-op commit (already committed) → still push. Add/commit/push failure → stop (no `run`).

Leftover dirty files are not an extra setup check. Shared `run` will fail `dirtyWorkTree`.

### `run`

1. `planLumpFromJsConfig` depth `contexts`. Empty list → message, `editLump` again, do not run.
2. Print context names. Confirm run (agent / LLM cost), default yes. No → print worker URL, done.
3. `installRunAbortHandlers` + `runLumpFromLumpName` (in-place shared, dedicated reset if they chose dedicated).
4. Shared success → print the current branch name. Do not say “open `lump/…` as a PR.” Set `data.branchName` to that branch. No `gh`.
5. Dedicated success (if they picked dedicated) → print the `lump/<lumpName>/…` branch `run` pushed. Still no `gh`. Still no `start`.
6. Failure → stop.

## Technical approach

| Step | Where | Contract |
| --- | --- | --- |
| 1 | `commands/setup/` | Drive + default prompter. JSON stub writer. `commitPush` git. |
| 2 | `commands/index.ts`, `main.ts` | Export `setup` + optional injections. |
| 3 | `readLocalConfig` / `readProjectJson` missing-file hints | May mention `setup` **or** `project-setup`. |
| 4 | DOCS + First PR + commands | See Docs updates. |

## Testing strategy

| Level | Host | Expect |
| --- | --- | --- |
| Unit | `commands/setup/` (colocate `testing/` if large) | No TTY / `--json` fail. Injected prompter: shared + JSON + README + cli push + `runLumpFromLumpName`. Custom tag retries until `getCommandPath` hits. Skill failure warns and continues. Empty plan returns to `editLump`. Shared never calls `launchStartDaemon`. `commitPush` add-list only; no `local.json`. Dedicated wipe confirm when mode is dedicated. |
| E2E | Optional | JSON exact-path `README.md` via `lump-plan` (already covered by the expander ticket). No live-agent `setup` drive. |

Do not inject TTY into other commands. Mock `execAsync` / `execBinary` / git.

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/website/app/pages/docs/start/first-pr.vue` | Happy path is `lumpcode setup`. Rehearsal on this branch. Skill is optional (the drive offers it). Link worker after. No copy / first-run `lump/…` PR. |
| `packages/apps/cli/DOCS/get-started.md` | Same. `project-setup` is flags-only. |
| `packages/apps/cli/DOCS/commands.md` + website `/docs/reference/commands` | New `setup` (options, TTY). Keep `project-setup`. Resume/start details can wait for the next ticket. |
| `AGENTS.md` | One bullet: `setup` is the interactive first-run drive; `project-setup` remains flag-only. |

## Acceptance criteria

1. `lumpcode setup --projectPath` is registered; TTY and `--json` gates fail as specified.
2. Fresh shared JSON + README plans to one context and `run` uses `runLumpFromLumpName`. Success prints `HEAD`’s branch, not `lump/…`, and does not open a PR.
3. `chooseCommand` never silently picks the first of several PATH presets.
4. `commitPush` `cli` adds only the allowlist; failure blocks `run`.
5. Shared never calls `launchStartDaemon`. Skill install failure does not abort.
6. First PR / get-started / commands match. No import of `commands/*/main`.
