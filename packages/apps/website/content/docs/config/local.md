---
title: Local config
description: .lumpcode/local.json is per machine and gitignored. run and start refuse to start without it.
---

`project-setup` scaffolds `{ "mode": "shared" }` and gitignores the file. Edit it on this machine; do not commit it.

```json
{
  "mode": "shared"
}
```

Worker clone:

```json
{
  "mode": "dedicated",
  "workspaceStrategy": "worktree",
  "maxParallelRun": 2
}
```

There is no `--mode` on `run` or `start`. Change this file (and restart the worker) instead.

## Modes

### `shared`

This clone is your editor. Lumpcode never checks it out for agent work. Every run uses a copy at `~/.lumpcode/project-copies/<projectName>/`, created once and reset by pre-flight.

Use on laptops.

### `dedicated`

This clone is owned by Lumpcode. Pre-flight fetch / switch / **hard reset** happens **in this folder**. Uncommitted work is wiped.

Use on a [worker](/docs/start/worker) you do not develop in.

## Workspace strategy

| Value | Behavior |
| --- | --- |
| `checkout` (default) | Switch the execution workspace onto the lump branch, then back. Sequential. |
| `worktree` | Agent runs in `.lumpcode/worktrees/<branch>/`. Needed for `maxParallelRun` > 1. |

`maxParallelRun` in this file (or `--maxParallelRun` on `start`) only applies with `worktree`. Passing the flag with `checkout` fails. Checkout always runs one lump at a time.

## Other local-only fields

| Field | Role |
| --- | --- |
| `disabled` | Pause **every** lump on this machine’s worker. Manual `run` is unaffected. |
| `verbose` | Lump default for engine logs. Not valid on `project.json`. |
| `primaryBranch` / `primaryBranches` | Override the committed primary. Local wins. |

`command` and `maximumNumberOfConcurrentBranches` may also live here as lump defaults (tag-shaped `command` only).

Misplaced keys such as `projectName` fail the parse.

## Several primary branches

`primaryBranches` is a **dedicated-worker** feature: one worker can scan `dev` and every remote `feature/*`. Shared mode logs once and uses only the exact primary; globs are not expanded.

Rules, short:

- The primary is the first **exact** entry. An all-glob list is invalid.
- Each lump `discoveryBranch` rule must be allowlisted against the configured (unexpanded) list.
- Same lump name on two different scan branches is fine. Two lumps with the same name on one scan branch fail worker launch.

`refreshCommand` (merged project/local, local wins) runs on each dedicated scan branch after pre-flight, before configs load. Failure skips that branch. Restart the worker after changing it.

More on workspaces and locks: [how a run works](/docs/start/run).
