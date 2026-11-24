# Requirements: History append as JSONL

| Field | Value |
| --- | --- |
| **Backlog** | `history-and-transcripts` · priority **4** · type **fix** |
| **Status** | Pending implementation |
| **Depends on** | None |
| **Packages** | `@lumpcode/core` (primary: history file util and the step-walk call). `@lumpcode/cli` (history path, schema description, operator docs). Recipes, dashboard, and website sources stay unchanged. |

## Problem statement and motivation

`keepHistory: true` records each step so an operator can tune a prompt later. The record is a gitignored YAML sequence. Append loads that whole file, pushes one entry, and writes the sequence back. One parse failure aborts the append. The step walk only warns, then moves on, so the new entry is never stored and every later append to that file fails the same way.

1. A single bad history file drops the next entry and every entry after it.
2. Append has to parse and rewrite every earlier entry to add one line.
3. The on-disk format is a YAML document, so one broken value fails the whole file.

## Goals

1. `keepHistory` still records the same step fields, in the same gitignored history directory.
2. A damaged history file cannot drop the next entry. Append adds one line and does not read the file first.
3. New history files are `.jsonl`: one JSON object per line. A line that does not parse is skipped on read.
4. `prompt` and `commandResult` are sanitized the same way they are today. A stringify failure warns, skips that entry, and the step walk continues.
5. Existing `.yaml` history files stay on disk and are not converted. `writeTranscripts` stays as it is.

## Non-goals

- Deleting, rewriting, or merging existing `.yaml` / `.yml` history files into the new file.
- A `lumpcode` command that prints history.
- Changing when an entry is written, or the `keepHistory` precedence (lump > local.json > project.json).
- `writeTranscripts`, transcript paths, or `lumpcode transcript`.
- Log retention. `retainLumpcodeLogs` already deletes old files under `history/` by age, any extension.
- A lock around append, or sanitizing fields other than `prompt` and `commandResult`.
- Turning `writeHistoryFile` into a JSONL rewriter.
- Editing `.lumpcode/.gitignore`. `**/history/` is already ignored.

## User stories / use cases

1. As an operator with `keepHistory: true` — a garbled history file still receives the next step, so one bad record does not end the log.
2. As an operator — I open `.lumpcode/lumps/<lumpName>/history/<contextName>.jsonl` and read one JSON object per line, with the same fields as today.
3. As an operator who already has `<contextName>.yaml` — that file is left in place. New steps go to `<contextName>.jsonl`.
4. As an operator — agent output that contains ANSI color or other C0 controls is stored without those controls in `prompt` and `commandResult`.
5. As a library caller — `appendHistoryEntry` reports a stringify or IO failure and writes nothing for that call. The step walk warns and continues into later steps and `postCommandExecFn`.
6. As an operator using transcripts — `writeTranscripts` and the transcript file are unchanged.

## Proposed behavior and UX

No new command and no new config field. `keepHistory: true` still turns recording on. Omit and `false` still turn it off.

### Where the file is

CLI path owner: `lumpHistoryFilePath`.

```text
.lumpcode/lumps/<lumpName>/history/<contextName>.jsonl
```

Same directory as today. The file is created on the first successful append. There is no initial `[]` document. Parent directories are created on that append.

`jsConfigToRunLumpInput` keeps calling `lumpHistoryFilePath` when `keepHistory` is true, and still returns a function that returns `undefined` when it is omitted or false.

A custom `getKeepHistoryFilePathFn` may return another path. The engine still passes that string to `appendHistoryEntry`. Only a `.jsonl` path (any letter case) is appended. A `.yaml` or `.yml` path is a failure: the file is not opened and not converted. The step walk warns and continues.

### When a line is written

Unchanged trigger, in `executeStepsForContextList`: after the command, before `postCommandExecFn`, and only when `commandFn` returned a command and the history path is non-empty. A skip (`null`, `undefined`, or no return) writes nothing.

The step walk still calls `appendHistoryEntry` and, on `Failure`, logs:

```text
Failed to append history entry to <filePath>: <reason>
```

It does not stop the walk and does not skip `postCommandExecFn`. `historyFile` does not log.

### Entry shape

One UTF-8 line per entry: `JSON.stringify` of the sanitized entry, no extra whitespace, then `\n`. Fields match `HistoryEntry` and the `postCommandExecFn` input (no `signal`):

| Field | On the line |
| --- | --- |
| `prompt` | string, sanitized |
| `commandResult` | string, sanitized |
| `commandSucceeded` | boolean |
| `context` | JSON object (`name`, `variables`, optional `options`) |
| `stepIndex` | number, or a JSON array of numbers for a nested step |
| `contextRunState` | JSON object |
| `lumpVariables` | JSON object |
| `stepVariables` | JSON object when present. `JSON.stringify` omits the key when the value is `undefined` |
| `projectRoot` | string |

Key order is not significant. Unknown keys on a value the caller passed through are kept. Newlines inside `prompt` and `commandResult` stay inside the JSON string, so one entry is one physical line.

Illustrative line:

```json
{"prompt":"Add an explicit return type","commandResult":"Updated foo.ts","commandSucceeded":true,"context":{"name":"foo","variables":{}},"stepIndex":0,"contextRunState":{},"lumpVariables":{},"projectRoot":"/repo"}
```

### Sanitize

Owner: `historyFile`, applied inside `appendHistoryEntry` to copies of `prompt` and `commandResult` only. The caller's entry object is not mutated. `postCommandExecFn` still sees the original strings.

Strip CSI sequences of the form ESC `[`, then digits and semicolons, then a letter, and strip C0 controls other than tab, line feed, and carriage return, including DEL. Same two classes as today.

### Append

Owner: `appendHistoryEntry` in `packages/core/src/utils/historyFile`. Callers do not write the file themselves.

```ts
appendHistoryEntry({
  filePath: string;
  entry: HistoryEntry;
}): Promise<Success<void> | Failure<string>>
```

- Extension must be `.jsonl` (case-insensitive). Otherwise `Failure` naming `filePath`, and no file is opened.
- Do not read the file, and do not call `readHistoryFile` or `writeHistoryFile`.
- Sanitize, then `JSON.stringify`. Either throw is a `Failure` naming `filePath` and the cause. No directory is created and no byte is written for that call.
- On success, create the parent directory, then append that one line and a `\n` in UTF-8 so earlier bytes are left as they are. A missing file is created by this append. A file whose existing contents do not parse still receives the new line.

### Read

Owner: `readHistoryFile` in the same util. No other module splits or parses history lines.

```ts
readHistoryFile({
  filePath: string;
}): Promise<Success<HistoryEntry[]> | Failure<string>>
```

`.jsonl` (case-insensitive):

- Missing file or other IO error: `Failure` naming `filePath`. Read does not create the file.
- Split on `\n`. Skip a line that is empty or whitespace. Skip a line that `JSON.parse` rejects. Skip a parsed value that is not a JSON object (`null`, array, string, number, boolean).
- Each remaining object is one `HistoryEntry`, in file order, with no field check. One bad line does not fail the read. A file of only bad lines is `Success` with `[]`.

`.yaml` / `.yml`: today's whole-document read, including the sanitize-and-retry parse. An invalid document is still a file-level `Failure`. Line skipping applies to JSONL only.

```ts
historyFormatFromPath(
  filePath: string,
): Success<'yaml' | 'jsonl'> | Failure<string>
```

`.yaml` and `.yml` → `'yaml'`. `.jsonl` → `'jsonl'`. Any other extension, including `.json`, is `Failure` naming `filePath`.

### YAML writer

`writeHistoryFile` stays the full-document YAML writer for `.yaml` / `.yml` only. A `.jsonl` path is `Failure` naming `filePath` and saying JSONL is written by `appendHistoryEntry`. The step walk does not call `writeHistoryFile`.

## Technical approach

1. In `historyFile`, extend `historyFormatFromPath` with `'jsonl'`. Keep the YAML branch of `readHistoryFile` and `writeHistoryFile` as they are. `writeHistoryFile` rejects `.jsonl`.
2. Rewrite `appendHistoryEntry` to the append contract above. It must not load the file or rewrite earlier entries.
3. Add the JSONL branch of `readHistoryFile` in that same module. The step walk and CLI commands do not parse lines.
4. Change `lumpHistoryFilePath` so the filename ends in `.jsonl`. Leave `jsConfigToRunLumpInput` on that helper.
5. Leave the warn-and-continue block in `executeStepsForContextList` as it is.
6. Update the docs listed under Docs updates.

| File | Change |
| --- | --- |
| `packages/core/src/utils/historyFile/main.ts` | JSONL append and read. YAML read/write stay. Append never reads. |
| `packages/core/src/helpers/executeStepsForContextList/main.ts` | Call site stays. Warn and continue stay. |
| `packages/apps/cli/src/utils/lumpHistoryFilePath/main.ts` | `<contextName>.jsonl`. |
| `packages/apps/cli/src/utils/jsConfigToRunLumpInput/main.ts` | Unchanged caller of `lumpHistoryFilePath`. |

## Docs updates

Canonical operator section: `packages/apps/cli/DOCS/config/lump.md` (**History**, plus the `keepHistory` row). Other pages only correct the path and link there.

| Document | What changes |
| --- | --- |
| `packages/apps/cli/DOCS/config/lump.md` | History is one JSON object per line at `history/<contextName>.jsonl`. Same fields, same write timing, still skipped when `commandFn` skips, still gitignored, still may contain secrets. A line that does not parse is skipped when the file is read. A damaged file does not drop the next append. Existing `.yaml` files are left in place and are not converted. Replace the YAML sample with one JSON line. The field row says JSONL, not YAML. |
| `packages/apps/cli/DOCS/start/observe.md` | Path becomes `.jsonl`. Link to the History section instead of restating the format. |
| `packages/apps/cli/DOCS/author/prompts.md` | Same path change and link. |
| `packages/core/README.md` | Library contract under `getKeepHistoryFilePathFn`, as in the table above. |
| `packages/apps/cli/src/schemas/lumpConfig.schema.json` | `keepHistory` description matches the new path and "one JSON object per line". |
| `.agents/memory/domain/engine-lifecycle.md` | One bullet, so later engine work does not describe the YAML rewrite. |

`DOCS/config/local.md`, `DOCS/config/project.md`, and `DOCS/config/types.md` mention the flag only. They stay as they are. The website renders `DOCS/` and has no separate copy.

## Acceptance criteria

1. `keepHistory: true` appends one JSON object per step to `.lumpcode/lumps/<lumpName>/history/<contextName>.jsonl`. Omit and `false` create no history file.
2. The object carries `prompt`, `commandResult`, `commandSucceeded`, `context`, `stepIndex`, `contextRunState`, `lumpVariables`, `projectRoot`, and `stepVariables` when it was set. `stepIndex` may be a number or an array of numbers.
3. Append does not read the file. A `.jsonl` file whose current contents do not parse still gains the new line, and the earlier bytes are unchanged.
4. A `.yaml` or `.yml` path passed to `appendHistoryEntry` is a `Failure`. That file's bytes stay as they are. Running with `keepHistory: true` does not convert or delete an existing `<contextName>.yaml`.
5. `prompt` and `commandResult` on disk have CSI sequences and C0 controls other than tab, LF, and CR removed. Other fields are unchanged. The object passed to `postCommandExecFn` is not sanitized.
6. `JSON.stringify` throwing, or sanitize throwing, yields `Failure`, creates no file, and appends no byte. The step walk warns with `Failed to append history entry to <filePath>: <reason>` and still runs later steps and `postCommandExecFn`.
7. `readHistoryFile` on `.jsonl` returns parseable objects in order and skips empty lines, invalid JSON, and non-objects. One bad line does not fail the read. A missing file is `Failure`.
8. `readHistoryFile` and `writeHistoryFile` on `.yaml` / `.yml` behave as they do today. `writeHistoryFile` rejects `.jsonl`. The step walk does not call it.
9. A skipped command (`commandFn` returns nothing) writes no history line. The first successful append creates parent directories and the file. The line ends with `\n`.
10. `writeTranscripts`, transcript paths, and `lumpcode transcript` are unchanged.
11. JSONL line splitting and append live only in `historyFile`. `lumpHistoryFilePath` only builds the path.
