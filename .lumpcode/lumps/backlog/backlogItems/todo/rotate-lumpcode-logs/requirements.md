# Requirements: Rotate Lumpcode logs

| Field | Value |
| --- | --- |
| **Backlog** | `rotate-lumpcode-logs` · priority **1** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | `live-step-transcripts` |
| **Packages** | `@lumpcode/cli` only (local schema, one util, docs). Core unchanged. |

## Problem statement and motivation

Daemon logs, `history/`, and the new transcripts grow without a cap. Verbose daemon logs already have no rotation. Transcripts add one full session file per lump line per tick.

1. A worker disk fills with files the operator did not mean to keep forever.
2. Retention has to be per machine, because the files live on the machine that ran the daemon.

## Goals

1. One util deletes old transcript and history files and trims this project's daemon and supervisor logs.
2. The policy lives in `.lumpcode/local.json` as `logRetention`.
3. Omitted config keeps 14 days. `maxAgeDays: 0` keeps everything.
4. Cleanup failure does not fail a tick or a `lumpcode run`.

## Non-goals

- Changing what gets written (streaming, presenters, `keepHistory` format).
- Rotating logs outside this project (other projects' daemon files, unrelated `~/.lumpcode` data).
- A CLI flag to clean on demand. The daemon tick and `lumpcode run` are the triggers.
- A second size cap. This replaces qol `truncate-log-files` (~1 MiB daemon and supervisor logs). Retention is `logRetention` only.
- Committing `local.json`.

## User stories / use cases

1. As an operator — I leave `local.json` unchanged and files older than 14 days disappear on the next tick or run.
2. As an operator — I set `logRetention.maxAgeDays` to keep a different window, or `0` to keep everything, on this machine only.
3. As an operator — a cleanup error shows up as a warning. The lump still runs.

## Proposed behavior and UX

### Config

`local.json` gains an optional object. `localConfig.schema.json` stays `additionalProperties: false`.

```json
{
  "mode": "dedicated",
  "logRetention": { "maxAgeDays": 14 }
}
```

| Field | Rule |
| --- | --- |
| `logRetention` omitted | Treat as `maxAgeDays: 14`. |
| `logRetention.maxAgeDays` | Integer ≥ 0. Required when the object is present. |
| `0` | Do not delete or trim anything. |
| `n > 0` | Drop data older than `n` days (mtime for files, leading timestamp for log lines). |

`LocalJsonConfig` picks the new field up with the other local keys. The daemon uses the `local.json` frozen at `start`, same as the other local fields. `lumpcode run` uses the `local.json` that invocation already loaded. Restart the worker to change retention for ticks.

### What is cleaned

Owner: `retainLumpcodeLogs` under `packages/apps/cli/src/utils/retainLumpcodeLogs/`. Callers pass `projectRoot`, `projectName`, the resolved `maxAgeDays`, and a logger. Callers do not reimplement the walk.

| Target | Rule |
| --- | --- |
| `.lumpcode/lumps/*/transcripts/**` files | Delete when mtime is older than `maxAgeDays`. Paths stay under the directory `lumpTranscriptFilePath` uses. Missing tree is success. |
| `.lumpcode/lumps/*/history/**` files | Same mtime rule. Do not delete the `history/` directory itself. |
| This project's daemon logs | Every log path from `daemonSchedulerFiles` for this `projectName`. |
| This project's supervisor log | `supervisorLogPath` for this `projectName`. |

Daemon and supervisor logs are opened append-only by the live process. Trim them **in place**. Do not rename or unlink the file (the holder would keep writing to an unlinked inode). Keep lines whose first token is an ISO-8601 timestamp newer than the cutoff. Lines with no leading timestamp stay. A line appended during the rewrite may be lost. That is acceptable.

### When it runs

- `runTick`, after the drain check and before lump lines run, so this tick's new transcript is not eligible.
- `lumpcode run`, once, before the lump starts, so a laptop that never starts a daemon still ages `history/`.

Both call `retainLumpcodeLogs`. On `Failure` or a thrown error, `logger.warn` and continue. Cleanup is not a `Failure` of the tick or the run.

## Technical approach

| Step | Owner | What changes |
| --- | --- | --- |
| 1 | `localConfig.schema.json`, `LocalJsonConfig` | `logRetention.maxAgeDays`. Omitted means 14 inside the util, not by schema default injection. |
| 2 | `retainLumpcodeLogs` | The only walk, delete, and in-place trim. |
| 3 | `runTick` | One call before lump lines, using frozen local config. |
| 4 | `run` command | One call before the lump, using the loaded local config. |
| 5 | Docs | Schema and local-config pages. |

Do not duplicate `daemonSchedulerFiles` or `supervisorLogPath` path strings inside the util. Ask those helpers.

## Testing strategy

| Level | Where | Proves |
| --- | --- | --- |
| Unit | `retainLumpcodeLogs/unit.test.ts` | File mtime: old transcript and history files go, fresh ones stay, missing dirs succeed. `maxAgeDays: 0` deletes nothing. Omitted policy behaves as 14. |
| Unit | same | Daemon log fixture: in-place rewrite keeps recent timestamped lines and untimestamped lines. The path is not unlinked. |
| Unit | `run` / `runTick` tests that already drive those entry points | Each calls the util once. A util failure is a warning and the run or tick still proceeds. |

Use temp directories. Do not touch the real `~/.lumpcode`.

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/cli/src/schemas/localConfig.schema.json` | `logRetention` description, including omitted = 14 days and `0` = keep. |
| `packages/apps/cli/DOCS/local-config.md` (or the project/local page that lists `local.json` fields) | Same contract. |
| `packages/apps/website/content/docs/config/local.md` | Same contract, in the field list. Note that a worker picks it up on restart. |

## Acceptance criteria

1. With `logRetention` omitted, transcript and history files older than 14 days are deleted on the next `lumpcode run` or daemon tick, and newer files remain.
2. `logRetention: { "maxAgeDays": 0 }` deletes and trims nothing.
3. A positive `maxAgeDays` trims this project's daemon logs and supervisor log in place, by leading ISO timestamp, without unlinking the file.
4. Untimestamped daemon-log lines are kept.
5. A cleanup error warns and does not fail the tick or the run.
6. No second implementation of the walk exists outside `retainLumpcodeLogs`.
