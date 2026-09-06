---
title: Start daemons from git
description: Commit a recipe under .lumpcode/daemons/ so a dedicated worker starts that daemon from git.
---

The **[worker](/docs/start/worker)** is the dedicated clone you leave running. A **daemon** is one scheduler on that machine (`--daemonId`, `daemon-status`). You can start daemons with `lumpcode start`, or commit a file and let the worker’s supervisor start them.

Shared mode ignores these files. A laptop in `shared` is not a worker.

Set up the machine first: [Leave a worker running](/docs/start/worker).

## File shape

Path is `.lumpcode/daemons/<id>.{json,yml,yaml}` (top-level only). The stem is the **daemon id**. Do not put `daemonId` in the file. Required field is `discoveryBranch` only.

```json .lumpcode/daemons/backlog.json
{
  "$schema": "https://lumpcode.com/schemas/daemonConfig.schema.json",
  "discoveryBranch": "dev",
  "include": ["backlog"]
}
```

| Field | Role |
| --- | --- |
| `discoveryBranch` | Required. Exact expanded primary this file applies to (no `*` / `?`). Must equal the `origin/<branch>` the file was read from. Push the file on that branch. |
| `cronSetup` | Cron for that daemon. Omit for `*/5 * * * *`. |
| `include` / `exclude` | Lump-name filters (`*` globs allowed). Omit or `[]` for all / none. |
| `disabled` | When `true`, stop or do not start this id. |
| `maxParallelRun` | Worktree only. Same meaning as `lumpcode start --maxParallelRun`. Checkout plus this field is not started. |

Editors: `$schema` `https://lumpcode.com/schemas/daemonConfig.schema.json`. Extra keys fail the schema.

## After you push

On the **worker** (dedicated clone), `lumpcode start` still starts one daemon the usual way. Use `lumpcode start --superviseOnly` when you want the supervisor up and **only** these files to start daemons. Cannot combine with `--include`, `--exclude`, `--daemonId`, `--cronSetup`, `--maxParallelRun`, `--lumpName`, or `--foreground`.

| Situation | What happens |
| --- | --- |
| Enabled file, that id not running | Starts that daemon |
| File contents changed | Stops, then starts the new recipe |
| File `disabled: true` or gone | Stops that daemon |
| A `lumpcode start` daemon already has that id | Leaves it alone |

Flags: [commands](/docs/reference/commands#lumpcode-start). If a file never starts: [troubleshooting](/docs/reference/troubleshooting#committed-daemon-file-never-starts).
