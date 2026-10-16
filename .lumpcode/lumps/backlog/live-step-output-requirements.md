# Requirements: Live step output

| Field | Value |
| --- | --- |
| **Backlog** | `backlog` lump · feature **live step output** |
| **Status** | Pending implementation |
| **Depends on** | None. Distinct from `history-and-transcripts` (committed light markdown and history JSONL). Do not implement that item here. |
| **Packages** | `@lumpcode/core` (chunk hook only) and `@lumpcode/cli`. Recipes and the website stay unchanged except docs pages that already describe history, `daemon-log`, or `local.json`. |

## Problem statement and motivation

A running lump is quiet until a command exits. `execBinary` holds stdout and stderr, then `executeStepsForContextList` logs the blob if `verbose` is on. `daemon-log` shows operational lines. Operators cannot watch an agent, or a plain command such as `npm i`, while it runs.

## Goals

1. Every step streams as it runs: plain commands stream process output, agent presets stream a session view.
2. `lumpcode run` prints that feed in the terminal. A daemon writes one gitignored file per lump line per tick, beside `history/`.
3. Later tickets can turn the session view down, and can delete old logs, without a second streaming path.

## Non-goals

- Loudness values other than the full session (`preset-output-loudness`).
- Deleting or truncating logs (`rotate-lumpcode-logs`).
- Changing `keepHistory`, `commandResult`, or the existing verbose `commandResult` line.
- Writing the live stream into the daemon log.
- `history-and-transcripts`: committed `transcripts/` on the branch workspace, history as JSONL, engine auto-inject. This feature's files are gitignored and are not committed with the LUMP marker.
- A follow command, a dashboard, or opening the agent's own chat UI.
- Parsing agent protocols inside `@lumpcode/core`.

## Key decisions and interfaces

One pipe. `@lumpcode/core` emits raw chunks and still returns the full stdout and stderr. `@lumpcode/cli` applies an optional per-command presenter and writes the sink. `commandResult` stays the raw string history and retry already consume.

```ts
type CommandOutputEvent =
  | { kind: 'start'; contextName: string; stepIndex: number | number[]; executable: string; commandName?: string }
  | { kind: 'chunk'; contextName: string; stepIndex: number | number[]; stream: 'stdout' | 'stderr'; chunk: string }
  | { kind: 'end'; contextName: string; stepIndex: number | number[]; succeeded: boolean };
```

`commandName` is copied from `commandFn.commandName` when that string is set. Inline command functions omit it. `chunk` is a UTF-8 string. A command that returns null emits no events.

`RunLumpInput.onCommandOutput?: (event: CommandOutputEvent) => void`. Owner of the call: `executeStepsForContextList`. Owner of the bytes: `execBinary`, via an optional `onChunk` invoked from the existing `data` listeners, while those listeners still concatenate `stdout` and `stderr`. No second reader of the pipes.

Presenter, on `CommandModule` (optional). A factory, so parallel lump lines do not share a parse buffer:

```ts
presentOutput?: () => (input: {
  stream: 'stdout' | 'stderr';
  chunk: string;
  outputDetail: 'loud' | 'quiet';
}) => string | undefined;
```

Absent factory: write the chunk unchanged. Present factory: write the returned string. `undefined` or `''` writes nothing. The CLI calls the factory once per step start and passes `outputDetail: 'loud'` until `preset-output-loudness`. A presenter throw is logged and that chunk is written raw. It does not fail the step.

Sinks, one CLI helper (name it with the transcript path util, do not fork a second writer in `run` and the daemon):

| Invocation | Sink |
| --- | --- |
| `lumpcode run` | Process stdout. No transcript file. |
| Daemon lump line | Append to the transcript file. Not the daemon log. |

Transcript path, owned by `lumpTranscriptFilePath` in `@lumpcode/cli`:

`.lumpcode/lumps/<lumpName>/transcripts/<branch segments>/<stamp>.log`

- Branch segments: `effectiveDiscoveryBranch` split on `/`. Reject empty, `.`, and `..`.
- Stamp: the tick's start time, ISO-8601 UTC, `:` replaced by `-` (example `2026-10-16T07-28-00.000Z`). One stamp per `runTick`, shared by every line in that tick.
- Gitignore line `.lumpcode/**/transcripts/`, exported beside `lumpTranscriptFilePath`. `scaffoldLumpcodeProject` and the first transcript write (`appendMissingGitignoreLines`) both use that constant.

Header on each `start` event, one line: `--- <lumpName> <contextName> <stepIndex> <executable>`. Nested `stepIndex` is joined with `.`. Then the presented chunks. Create the file on the first step header. A step that prints nothing still leaves that header. A line with no steps leaves no file. A path-helper `Failure` logs a warning and the lump line still runs, with no transcript file.

Shipped presets `cursor`, `copilot`, `claude-code`, `codex`, and `opencode` export `presentOutput`. At `loud` the text includes assistant messages and tool activity (tool name and the file or command). It does not include raw protocol frames. Each preset owns the argv that makes its CLI emit a stream it can present.

## Tickets

| Order | Ticket | Delivers | Requirements |
| --- | --- | --- | --- |
| 1 | `live-step-transcripts` | Stream every step. Terminal on `run`. Daemon file per lump line per tick. Presets present the full session. | `backlogItems/completed/live-step-transcripts/requirements.md` |
| 2 | `rotate-lumpcode-logs` | `local.json` `logRetention` deletes old transcripts, history, and trims daemon and supervisor logs. | `backlogItems/todo/rotate-lumpcode-logs/requirements.md` |
| 3 | `preset-output-loudness` | `outputDetail` on lump and step variables. `quiet` drops tool activity from the sink. | `backlogItems/todo/preset-output-loudness/requirements.md` |
| 4 | `transcript-command` | `lumpcode transcript` prints or follows a daemon transcript file; `--list` catalogs stamps and branches. | `backlogItems/todo/transcript-command/requirements.md` |

Tickets 2, 3, and 4 all depend on ticket 1. They do not depend on each other.

## Acceptance criteria

1. `lumpcode run` shows each step's output while the process is still running.
2. A daemon tick leaves one transcript file per lump line, named with that tick's start time and the discovery branch, and does not write that stream to the daemon log.
3. An agent preset's transcript shows assistant text and tool activity, not raw protocol frames. A command with no `presentOutput` shows the process output.
4. History entries and retry input still receive the raw command output.
5. Transcripts are gitignored. Nothing in this feature deletes old files or reads a loudness setting.
