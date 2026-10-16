# Requirements: Live step transcripts

| Field | Value |
| --- | --- |
| **Backlog** | `live-step-transcripts` · priority **0** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | None. See [live-step-output-requirements.md](../../../live-step-output-requirements.md). |
| **Packages** | `@lumpcode/core` (chunk hook) and `@lumpcode/cli` (sink, path, presets, docs). Recipes unchanged. |

## Problem statement and motivation

Operators cannot see what a lump is doing until each command exits. Agent stdout is buffered in `execBinary` and, when `verbose` is on, dumped afterward. Daemon logs stay operational and do not carry the live session.

1. A plain step such as `npm i` produces nothing until it exits.
2. An agent step's CLI noise is not a session an operator can read, and it arrives only at the end.
3. On a worker there is no terminal, so the same feed needs a file.

## Goals

1. Every step emits output while the process is still running.
2. `lumpcode run` prints that feed on the terminal and does not write a transcript file.
3. A daemon writes one file per lump line per tick under the lump, next to `history/`, gitignored.
4. Shipped agent presets present the full session: assistant text and tool activity.
5. `commandResult` stays the raw stdout (stderr when stdout is empty), for history and retry.

## Non-goals

- `outputDetail` / `quiet` (`preset-output-loudness`). This ticket always presents `loud`.
- Deleting old transcripts, history, or daemon logs (`rotate-lumpcode-logs`).
- Changing `keepHistory` or the verbose `commandResult` log line.
- Copying the live feed into the daemon log.
- Implementing `history-and-transcripts` (committed light markdown, history JSONL).
- A `follow` subcommand.

## User stories / use cases

1. As an operator running `lumpcode run` — I see each step's output in the terminal as it happens, so I can tell whether the agent or `npm i` is working.
2. As an operator on a worker — I open one file per lump line for that tick and read the same feed, without `daemon-log` filling with the session.
3. As an author using a shipped agent preset — the file shows the session (messages and tool activity), not protocol frames.
4. As an author with a custom command and no presenter — I still see the process stdout and stderr, live.

## Proposed behavior and UX

Shared shape: [live-step-output-requirements.md](../../../live-step-output-requirements.md). This ticket implements that shape with `outputDetail` fixed to `'loud'`.

### Core hook

`execBinary` accepts optional `onChunk({ stream, chunk })` and still resolves `{ stdout, stderr }` as today. `executeStepsForContextList` is the only caller that forwards chunks. It also emits `start` before spawn and `end` after the command settles, including when the command returns no chunks and when the command fails.

`RunLumpInput.onCommandOutput` is optional. Omitting it keeps today's buffering behavior for callers that do not care.

### CLI sink

One helper, used by `run` and by the daemon lump line. It owns header lines and presenter calls. `run` and `runForeground` must not write the feed themselves.

On `start`, write one header line containing the lump name, context name, step index, and executable.

On `chunk`, if that command's module exports `presentOutput`, call the function returned by invoking the factory at `start`, with `outputDetail: 'loud'`. Write the returned string. If the factory is absent, write the chunk. If the presenter throws, log a warning and write the raw chunk.

On `end`, write nothing required. The next `start` is the next header.

| Invocation | Where the feed goes |
| --- | --- |
| `lumpcode run` (shared or dedicated) | Process stdout. No file. |
| Daemon execution of a lump line | Transcript file only. |

A write error on the file logs a warning and does not fail the lump line.

### Transcript path

Owner: `lumpTranscriptFilePath({ projectRoot, lumpName, discoveryBranch, tickStartedAt })`.

```text
.lumpcode/lumps/<lumpName>/transcripts/<branch segments>/<stamp>.log
```

`discoveryBranch` is the line's `effectiveDiscoveryBranch`. Split on `/`. A segment that is empty, `.`, or `..` fails the path helper with a `Failure`. `tickStartedAt` is one ISO-8601 UTC timestamp taken at the start of `runTick` (the same instant as the existing `runTick` info line) and passed into every line of that tick. `stamp` is that timestamp with `:` replaced by `-`.

Example: branch `feature/foo`, tick `2026-10-16T07:28:00.000Z` → `.lumpcode/lumps/myLump/transcripts/feature/foo/2026-10-16T07-28-00.000Z.log`.

Create the file when the lump line starts, before the first step. Two lines in one tick (different lump or different branch) are two files. The same line does not run twice in one tick.

### Gitignore

Constant `TRANSCRIPTS_GITIGNORE_LINE = '.lumpcode/**/transcripts/'` lives next to `lumpTranscriptFilePath`. `scaffoldLumpcodeProject` appends it with the history line. The first transcript write also calls `appendMissingGitignoreLines` with that constant so existing projects pick it up. No second copy of the string.

### Presets

`CommandModule.presentOutput` is the optional factory in the shared doc. Ship it on `cursor`, `copilot`, `claude-code`, `codex`, and `opencode`. Each preset owns the argv change that makes its CLI emit a stream the presenter can turn into assistant text plus tool activity. Tool activity includes the tool name and the file or command. Raw protocol frames are not written. Custom modules may omit the factory.

`commandResult` is still assigned from the exec result after the process exits, not from the presented text.

## Technical approach

| Step | Owner | What changes |
| --- | --- | --- |
| 1 | `execBinary` | Optional `onChunk` beside the existing concatenate listeners. |
| 2 | `executeStepsForContextList` | Emit `start` / `chunk` / `end` on `RunLumpInput.onCommandOutput`. Do not format. |
| 3 | `lumpTranscriptFilePath` | Path, stamp, branch-segment check, gitignore constant. |
| 4 | CLI sink helper | Headers, presenter, terminal vs file. Sole writer. |
| 5 | `run` | Register the sink to stdout. Do not open a transcript file. |
| 6 | `runTick` / lump line | Capture one tick timestamp. Register the sink to that line's file. |
| 7 | Shipped presets | `presentOutput` factory and whatever argv that factory requires. |
| 8 | Docs | Surfaces below. |

## Testing strategy

| Level | Where | Proves |
| --- | --- | --- |
| Unit | `packages/core/src/helpers/execBinary/unit.test.ts` | `onChunk` fires as chunks arrive. Returned `stdout` / `stderr` are still complete. |
| Unit | `executeStepsForContextList/testing/general.unit.test.ts` | `start` before chunks, `end` after, including a command that prints nothing. `commandResult` stays raw when a presenter would have changed the live text (presenter is CLI; core test uses the raw hook). |
| Unit | `packages/apps/cli/src/utils/lumpTranscriptFilePath/unit.test.ts` | Path template, colon-free stamp, rejection of `.` and `..` segments. |
| Unit | CLI sink tests next to that helper | Absent presenter writes the chunk. Presenter output is what is written. A throw falls back to the raw chunk. `run` does not create a file. A daemon line creates the file and does not touch the daemon log path. |
| Unit | One test per shipped preset | A recorded protocol chunk becomes assistant text and a tool line, and the raw frame is absent. `outputDetail: 'loud'`. |
| Existing | History tests in `executeStepsForContextList` | Still store raw `commandResult`. |

No new E2E is required if the sink tests cover terminal vs file. Do not assert on daemon-log contents beyond "the live feed was not appended there."

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/cli/DOCS/concepts.md` | Live feed: terminal on `run`, transcript file on a daemon. Point at the path. History stays the after-the-fact prompt record. |
| `packages/apps/cli/DOCS/commands.md` | `daemon-log` remains the operational log. Say where the session file is. |
| `packages/apps/cli/DOCS/lump-config.md` | Transcripts are gitignored, written for daemon runs, not gated on `keepHistory`. |
| `packages/apps/website/content/docs/start/run.md` | `run` streams steps in the terminal. |
| `packages/apps/website/content/docs/reference/commands.md` | `daemon-log` vs the transcript file. |
| `packages/apps/website/content/docs/config/lump.md` | Transcripts are a daemon file beside `history/`, not gated on `keepHistory`. History stays the after-the-fact record. |

Do not document `outputDetail` or retention in this ticket.

## Acceptance criteria

1. During `lumpcode run`, a step's stdout appears before the process exits.
2. A daemon tick writes `.lumpcode/lumps/<lumpName>/transcripts/<branch>/<stamp>.log` for each lump line, using that tick's start time, and the daemon log does not receive that stream.
3. The transcript starts with a header per step (lump, context, step index, executable) even when the command prints nothing.
4. Shipped presets' presented text includes assistant text and tool activity and omits raw protocol frames.
5. A module without `presentOutput` streams raw stdout and stderr.
6. History and `postCommandExecFn` still see the raw command output.
7. `.gitignore` gains `.lumpcode/**/transcripts/` on scaffold and on first transcript write, via the one shared constant.
8. No `outputDetail` key is read. No log file is deleted.
