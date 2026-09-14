# Requirements: `setup` resume and dedicated worker

| Field | Value |
| --- | --- |
| **Backlog** | `setup-resume-and-worker` · priority **2** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | `setup-first-pr-drive` |
| **Packages** | Primary: `@lumpcode/cli` (`commands/setup`). Also: website worker page + commands docs. Core / recipes / `cli-types` / `cli-utils` unchanged. |

## Problem statement and motivation

The first-run drive fails closed when `.lumpcode/` already exists. A worker clone already has the lump on git and only needs this machine’s `local.json` plus optional `start`. Dedicated `start` is still missing from the drive.

1. `setup` cannot resume on a hole that already has project files.
2. Worker docs must not tell the operator to re-run `project-setup`.

## Goals

1. Existing valid `project.json` is not rewritten. Mode (and dedicated strategy) are still asked and merged onto `local.json`.
2. An existing lump config skips format / command / name / stub write. `editLump` still runs.
3. Dedicated opt-in `start` uses `launchStartDaemon` unfiltered `global`. Shared never starts a daemon.
4. Worker page may use `setup` to write `local.json` / offer `start`. Still not `project-setup`.

## Non-goals

- Changing `project-setup` (still refuses an existing `.lumpcode/`).
- js/ts stubs (next ticket). Resume still skips stub write when any lump config exists.
- Opening a PR. Suggesting a git branch.
- Importing `commands/*/main`.
- Shared `start` (must keep failing `sharedModeNoDaemon` if someone calls `launchStartDaemon`; this drive must not call it).

## User stories / use cases

1. As an operator on a worker clone — `.lumpcode/` is already on git. I run `setup`, pick dedicated, confirm the wipe, skip lump create, optionally `run`, then start the unfiltered worker.
2. As an operator re-running `setup` on a laptop — I change this machine to shared; extra keys already on `local.json` stay.

## Proposed behavior and UX

When `.lumpcode/` exists, skip the first-run fail-closed. Apply:

| Present | Action |
| --- | --- |
| Valid `project.json` `projectName` | Do not rewrite `project.json`. |
| `local.json` | Ask mode (default current or `shared`). Ask `workspaceStrategy` / `maxParallelRun` **only if dedicated**. Dedicated → wipe confirm (`run` resets **this** checkout). Merge only the keys just answered; never delete extra keys (`refreshCommand`, `disabled`, …). Shared answers write `mode` and do not add strategy / `maxParallelRun`. |
| Lump config already on disk | Skip `configFormat`, `chooseCommand`, `lumpName`, stub write. Still `editLump`. |
| Nothing new to commit | Still offer `commitPush` (push may still be needed). |

Fresh dedicated (no `.lumpcode/`) already asks wipe + strategy in the first-run ticket. This ticket adds the same prompts on resume and wires `start`.

### `start` (dedicated only)

After `run` (or after declined run):

- Shared: do not call `launchStartDaemon`. Print `https://www.lumpcode.com/docs/start/worker`.
- Dedicated: confirm “leave a worker running?”, default yes. Yes → `launchStartDaemon` unfiltered `daemonId: 'global'`, default cron, detached (not `--foreground`). Print `daemon-status` / `daemon-log` / `stop`. Set `data.startedDaemon: true`.
- `run` failure → stop. No `start`.

`Output.data` may include `startedDaemon?: boolean`.

## Technical approach

| Step | Where | Contract |
| --- | --- | --- |
| 1 | `commands/setup/` | Resume merge for `local.json`. Dedicated `start` via `launchStartDaemon` only. |
| 2 | Worker + commands docs | See Docs updates. |

Do not reimplement start gates; `launchStartDaemon` already refuses shared.

## Testing strategy

| Level | Host | Expect |
| --- | --- | --- |
| Unit | `commands/setup/` | Existing `project.json` not rewritten. `local.json` merge keeps extra keys. Existing lump skips stub write. Dedicated wipe confirm. Shared never calls `launchStartDaemon`. Dedicated yes → `launchStartDaemon` with `daemonId: 'global'`. |
| Unit | existing `start` / `launchStartDaemon` | Unchanged `sharedModeNoDaemon`. |

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/website/app/pages/docs/start/worker.vue` | May run `setup` to write `local.json` / offer `start`. Still do **not** run `project-setup`. Laptop `run` was rehearsal; this clone is the campaign. |
| `packages/apps/cli/DOCS/commands.md` + website commands | Resume behavior and dedicated `start` on `setup`. |

## Acceptance criteria

1. Resume does not rewrite `project.json`; still prompts mode; skips stub when a lump config exists.
2. Dedicated opt-in `start` uses unfiltered `global` via `launchStartDaemon`.
3. Shared never calls `launchStartDaemon`.
4. `project-setup` on an existing tree still fails.
5. Worker page matches. No second start-mode check outside `assertDedicatedDaemonRequired` / `launchStartDaemon`.
