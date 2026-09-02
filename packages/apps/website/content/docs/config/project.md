---
title: Project config
description: .lumpcode/project.json is committed. It names the project and can set team defaults every lump inherits.
---

`lumpcode project-setup` writes this file next to `.git`. Commit it.

```json
{
  "projectName": "my-monorepo",
  "primaryBranch": "dev",
  "command": "cursor",
  "maximumNumberOfConcurrentBranches": 2
}
```

## Fields

| Field | Required | Notes |
| --- | --- | --- |
| `projectName` | yes | Letters, digits, `_`, `-` only. Daemon filenames and `~/.lumpcode/project-copies/<projectName>/`. |
| `primaryBranch` or `primaryBranches` | yes after merge with local | Integration line. Either this file or `local.json` may supply it; local wins. |
| `command` | no | Lump default. Tag only, not a `.ts` path. |
| `maximumNumberOfConcurrentBranches` | no | Lump default. |
| `keepHistory` | no | Lump default. |
| `refreshCommand` | no | Dedicated worker only, before loading lumps on a scan branch. Local wins. Ignored by `run` and by shared mode. |

Unknown keys fail. Do not put `mode`, `workspaceStrategy`, `disabled`, `maxParallelRun`, or `verbose` here. Those are [local](/docs/config/local).

`project-setup` infers `projectName` from `git remote get-url origin` or the directory basename if you omit `--projectName`. `--primaryBranch` defaults to `main`.

## Merge

Shared keys present on both project and local: **local wins**. After merge, a primary source is required.

Lump defaults (`command`, `maximumNumberOfConcurrentBranches`, `keepHistory`): **lump > local > project**, only when the lump leaves the field undefined.

A worker process reads this merge **once** at `start`. Restart the worker after you change either file.

## What to commit

Commit `project.json` and lump folders. Gitignore `local.json`. `project-setup` already appends `local.json`, `history/`, `.cache/`, and `contextStatusRecord.json` to `.gitignore`.
