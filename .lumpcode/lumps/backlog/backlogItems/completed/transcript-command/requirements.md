# Requirements: Transcript command

| Field | Value |
| --- | --- |
| **Backlog** | `transcript-command` · priority **3** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | `live-step-transcripts` |
| **Packages** | `@lumpcode/cli` only (command, two utils, docs). Core and recipes unchanged. |

## Problem statement and motivation

A daemon already writes the live step feed to `.lumpcode/lumps/<lumpName>/transcripts/<branch>/<stamp>.log`. Operators still have to know that path and open the file. `daemon-log` is the operational log and must stay that.

1. Watching a worker session means hunting a gitignored path.
2. One lump can have many branches and stamps, including the same stamp on two discovery branches in one tick.
3. Dumping a whole agent session is too much by default.

## Goals

1. `lumpcode transcript` prints or follows one daemon transcript file.
2. `--list` catalogs stamps and discovery branches, most recent first.
3. `--lines` defaults to last 10. `0` means the whole file. `daemon-log` uses the same contract.
4. The command never reads the daemon log. `lumpcode run` still does not write a transcript file.

## Non-goals

- `outputDetail` / `quiet` (`preset-output-loudness`).
- Deleting old transcripts (`rotate-lumpcode-logs`).
- `history-and-transcripts` (committed markdown, history JSONL).
- Waiting for a file that does not exist yet (`tail -F`).
- A dashboard view of transcripts.
- A second `tail` implementation inside `daemon-log` after this ticket.
- Changing what the daemon writes, or writing a file from `lumpcode run`.

## User stories / use cases

1. As an operator on a worker — I run `lumpcode transcript --lumpName <name>` and watch the latest session as it grows.
2. As an operator — I run `--list` (optionally scoped) to see which stamps and branches exist, newest first, then print one with `--stamp` / `--discoveryBranch`.
3. As an operator — I pass `--noFollow --lines 0` when I want the full session, and I do not get that dump by default.
4. As an operator — `daemon-log` still tails the operational log, with the same `--lines` default and `0` = whole file.

## Proposed behavior and UX

### Command

```text
lumpcode transcript --lumpName <name> [--discoveryBranch <branch>] [--stamp <stamp>] [--lines <n>] [--noFollow]
lumpcode transcript --list [--lumpName <name>] [--discoveryBranch <branch>]
```

Name: `transcript`. Registered like the other CLI commands (`commands/index.ts` + `main.ts` injections). Injections: `projectRoot`, `localConfigFolderPath`, optional `spawnFn`. Not a Lumpcode project root is a failure.

| Option | Print | `--list` |
| --- | --- | --- |
| `--lumpName` | Required | Optional (omit = every lump that has a `.log`) |
| `--discoveryBranch` | Optional filter | Optional filter (exact branch, not a prefix) |
| `--stamp` | Optional; filename token without `.log` (example `2026-10-16T07-28-00.000Z`). Not a second ISO spelling. | Invalid |
| `--lines` | Integer ≥ 0. Omitted = 10. `0` = whole file. | Invalid |
| `--noFollow` | Print and exit | Invalid |
| `--json` | Only with `--noFollow` | Allowed (list never follows) |

Missing `--lumpName` without `--list` is a failure.

The command does not take `--daemonId`. It does not open a daemon log path.

### Print selection

Owner: `resolveLumpTranscriptFile` in `lumpTranscriptFilePath`. The command does not `readdir` or join path segments.

Among `.log` files for `--lumpName`, after applying `--discoveryBranch` and `--stamp` when given:

- Newest **stamp** wins (filename token, not mtime).
- Several files share that stamp and `--discoveryBranch` is omitted → failure, ask for `--discoveryBranch`.
- `--stamp` given but no file → failure. Do not fall back to another stamp.
- No matching file → failure. Message names the flags given and points at `--list`.
- File missing on disk → failure. Do not wait for create.

Does not require a running daemon. The file is created on the first step header, so a tick with no steps yet has nothing to follow.

### Follow and `--lines`

Shared with `daemon-log` via `tailFile`. Follow by default. `--noFollow` prints and exits. Omitted `--lines` is 10. `--lines N` (N > 0) is last N. `--lines 0` is the whole file; with follow, from the start then keep following.

`--json` without `--noFollow` in print mode is a failure. Follow inherit until SIGINT/SIGTERM, then success `messages: ['Stopped following transcript.']`.

Human `--noFollow`: the selected lines are the result `messages`. No extra header; the file already has `--- <lumpName> …` step headers.

`--json --noFollow` success:

```ts
{
  messages: string[]; // same lines
  data: {
    lumpName: string;
    discoveryBranch: string;
    stamp: string;
    filePath: string;
    lines: string[];
  };
}
```

### List

Owner: `listLumpTranscriptFiles` in `lumpTranscriptFilePath`. One `.log` file is one row. `discoveryBranch` is the directory path under that lump’s `transcripts/` with the filename stripped (`feature/foo/2026-10-16T07-28-00.000Z.log` → `feature/foo`). Non-`.log` ignored. Missing tree is success with no rows. Unexpected IO is a `Failure`.

Sort: stamp descending, then `lumpName`, then `discoveryBranch`.

Human, one line per row:

```text
<stamp>  <lumpName>  <discoveryBranch>
```

Empty catalog: success, no lines, `transcripts: []`. Not a failure.

`--json --list` success:

```ts
{
  messages: string[]; // same human lines, empty when none
  data: {
    transcripts: Array<{
      lumpName: string;
      discoveryBranch: string;
      stamp: string;
      filePath: string;
    }>;
  };
}
```

### `daemon-log` `--lines`

Same numbers as print: omitted = 10, N > 0 = last N, `0` = whole file (with follow: from the start). Today omitted already means last 10 via Unix `tail`; `--lines 0` is a parse error and becomes valid. Other `daemon-log` behavior (scope, missing file, `--json` follow) stays.

### Shared contracts

```ts
type LumpTranscriptFile = {
  lumpName: string;
  discoveryBranch: string;
  stamp: string;
  filePath: string;
};

listLumpTranscriptFiles({
  projectRoot: string;
  lumpName?: string;
  discoveryBranch?: string;
}): Promise<Success<LumpTranscriptFile[]> | Failure<string>>

resolveLumpTranscriptFile({
  projectRoot: string;
  lumpName: string;
  discoveryBranch?: string;
  stamp?: string;
}): Promise<Success<LumpTranscriptFile> | Failure<string>>

tailFile({
  filePath: string;
  lines: number; // 0 = from start / whole file
  follow: boolean;
  spawnFn?: typeof spawn;
}): Promise<Success<{ lines: string[] }> | Success<{ followed: true }> | Failure<string>>
```

Commands resolve omitted `--lines` to `10` before calling `tailFile`. `tailFile` always receives a number. `lines === 0` must not spawn `tail -n 0` (that is empty). Whole-file `--noFollow` reads the file. Whole-file follow is from line 1 then `-f`.

Failures are `messages[]` like `daemon-log`. No new `data.code` values.

## Technical approach

| Step | Owner | What changes |
| --- | --- | --- |
| 1 | `lumpTranscriptFilePath` | `listLumpTranscriptFiles` and `resolveLumpTranscriptFile`. Path template, stamp, gitignore stay here. Callers do not concatenate `.lumpcode/lumps/…/transcripts`. |
| 2 | `tailFile` (`packages/apps/cli/src/utils/tailFile/`) | The only `tail` / whole-file reader. Barrel-export from `utils/index.ts`. |
| 3 | `daemon-log` | Call `tailFile`. `--lines` integer ≥ 0. Operator-visible default stays last 10. `--lines 0` becomes valid. Do not import `commands/transcript`. |
| 4 | `commands/transcript/` | Flag matrix, list vs print, envelopes. Calls `listLumpTranscriptFiles` / `resolveLumpTranscriptFile` / `tailFile` only. |
| 5 | `commands/index.ts`, `main.ts` | Register `transcript` with the same injection shape as other project commands (`projectRoot`, `localConfigFolderPath`, plus `spawnFn`). |
| 6 | Docs | Surfaces below. Parent ticket table in `live-step-output-requirements.md`. |

`loadCommandModule` / presenters / `prepareLumpTranscriptFile` are unchanged.

## Testing strategy

| Level | Where | Proves |
| --- | --- | --- |
| Unit | `lumpTranscriptFilePath/unit.test.ts` | Nested branch reconstruction, exact `--discoveryBranch` (not prefix), stamp-desc sort, resolve latest, ambiguous same-stamp without branch, missing stamp does not fall back, empty tree is `[]`. |
| Unit | `tailFile/unit.test.ts` | Omitted-equivalent 10, N, `0` `--noFollow` is the whole file, `0` follow starts at the beginning. Never `tail -n 0`. |
| Unit | `commands/transcript/unit.test.ts` | `--lumpName` required unless `--list`; `--list` rejects `--stamp` / `--lines` / `--noFollow`; `--json` print requires `--noFollow`; `--json --list` succeeds; print missing file fails and mentions `--list`; follow is not asserted by dumping a daemon log. |
| Unit | `commands/daemon-log/unit.test.ts` | `--lines 0` is accepted and means the whole log. Omitted `--lines` still last 10. `buildTailArgs` in the command goes away; argv lives in `tailFile`. |

Use temp directories. No new E2E. Do not touch the real `~/.lumpcode`.

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/cli/DOCS/commands.md` | New `lumpcode transcript` section (TOC under Daemon). `daemon-log` `--lines`: omitted = 10, `0` = whole file, and point at `transcript` for the session file. |
| `packages/apps/cli/DOCS/concepts.md` | The live-feed sentence names `lumpcode transcript` as how to read the daemon file. |
| `packages/apps/website/content/docs/reference/commands.md` | Same command and `--lines` contract. |
| `packages/apps/website/content/docs/config/lump.md` | One line: read daemon transcripts with `lumpcode transcript`, not by opening the path by hand. |
| `.lumpcode/lumps/backlog/live-step-output-requirements.md` | Add this ticket to the table. |

Do not document `outputDetail` or retention here.

## Acceptance criteria

1. `lumpcode transcript --lumpName <name>` follows the newest transcript for that lump (last 10 lines, then live). It does not read the daemon log.
2. `--list` prints `<stamp>  <lumpName>  <discoveryBranch>` newest stamp first. Empty catalog is exit 0.
3. Same newest stamp on two branches without `--discoveryBranch` fails and asks for the branch.
4. `--noFollow` without `--lines` prints 10 lines, not the whole file. `--lines 0` prints the whole file.
5. `--json` print without `--noFollow` fails. `--json --list` succeeds.
6. `--list` with `--stamp`, `--lines`, or `--noFollow` fails.
7. `daemon-log --lines 0` prints the whole operational log. Omitted `--lines` is still last 10.
8. No second directory walk or `tail` argv builder outside `lumpTranscriptFilePath` and `tailFile`.
