# Learnings

## Expected
`desc.yml` (`workflow: [req, impl]`, priority 4, no `dependsOn`): keep `keepHistory`. Append must not drop the next entry when the history file fails to parse. Replace the read-and-rewrite YAML append with append-only JSONL, one JSON object per line, with the `HistoryEntry` fields (`prompt`, `commandResult`, `commandSucceeded`, `context`, `stepIndex`, `contextRunState`, `lumpVariables`, `stepVariables`, `projectRoot`). Sanitize ANSI/C0 in `prompt` and `commandResult` as today. A line that does not parse is skipped on read. Append does not read the file first. A stringify failure warns and skips that entry. The step walk continues. New files are `.jsonl` in the same gitignored history directory. Existing `.yaml` files stay on disk and are not converted. `writeTranscripts` stays as it is.

This stage writes `requirements.md` for that task. No `testPlan.md` or `expect.yml`. No parent item.

## Landed
Working tree only. No marker commit yet.

- `.lumpcode/lumps/backlog/backlogItems/todo/history-and-transcripts/requirements.md` records the task: JSONL append owned by `appendHistoryEntry` in `packages/core/src/utils/historyFile`, path from `lumpHistoryFilePath`, read skips a bad JSONL line, stringify failure is a `Failure` the step walk already warns on, leftover `.yaml` is not converted, `writeTranscripts` unchanged. Docs to update are `DOCS/config/lump.md` (canonical), `DOCS/start/observe.md`, `DOCS/author/prompts.md`, `packages/core/README.md`, `lumpConfig.schema.json`, and the `keepHistory` bullet in `.agents/memory/domain/engine-lifecycle.md`.
- `learnings.md` (this file).

`desc.yml` was not edited.
