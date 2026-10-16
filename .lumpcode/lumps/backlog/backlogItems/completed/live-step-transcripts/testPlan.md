# Test plan: Live step transcripts

Expects from [requirements.md](./requirements.md). `outputDetail` stays `'loud'`. Nothing deletes logs.

## Test cases

| Id | Level | Where | Proves |
| --- | --- | --- | --- |
| E1 | Unit | `packages/core/src/helpers/execBinary/unit.test.ts` | `onChunk` receives UTF-8 stdout and stderr while the process is still running. Returned `stdout` / `stderr` equal the concatenated chunks. |
| E2 | Unit | `executeStepsForContextList/testing/general.unit.test.ts` | `start` before chunks, `end` after, including a command that prints nothing and a command that exits non-zero (`succeeded: false`). A null command emits nothing. `start.commandName` is set only when `commandFn.commandName` is set. Nested step index stays `number[]`. |
| E3 | Unit | same file | History `commandResult` stays the raw stdout (stderr when stdout is empty), including the existing message fallback on failure. The hook seeing chunks does not replace that string. |
| E4 | Unit | `packages/apps/cli/src/utils/lumpTranscriptFilePath/unit.test.ts` | Path `.lumpcode/lumps/<lumpName>/transcripts/<segments>/<stamp>.log`. Stamp `2026-10-16T07:28:00.000Z` becomes `2026-10-16T07-28-00.000Z`. `.`, `..`, and empty segments are `Failure`. Preparing the file does not create it. The first non-empty write creates it and appends. An empty write does not. `TRANSCRIPTS_GITIGNORE_LINE` is appended once. A fake daemon log file beside it is unchanged. |
| E5 | Unit | `packages/apps/cli/src/utils/lumpTranscriptFilePath/liveStepOutput.unit.test.ts` | Header is `--- <lumpName> <contextName> <stepIndex> <executable>\n` (`0.1` for `[0, 1]`). Absent presenter writes the chunk. Presenter return value is what is written. `''` writes nothing. A throw warns and writes the raw chunk. `outputDetail` is `'loud'`. `end` writes nothing. |
| E6 | Unit | `packages/apps/cli/src/commands/run/unit.test.ts` | `run` passes a stdout writer and does not create `.lumpcode/lumps/**/transcripts/`. |
| E7 | Unit | one file under `packages/apps/cli/src/presets/commands/` | Each shipped preset: one recorded stdout chunk becomes assistant text plus a `tool <name> <target>` line, and the raw JSON line is absent. A split chunk still presents once the line completes. |
| E8 | Existing | `scaffoldLumpcodeProject/unit.test.ts`, `project-setup/unit.test.ts` | `.gitignore` gains `.lumpcode/**/transcripts/` from the shared constant. |
| E9 | Existing | `ensurePresetCommandsInstalled/unit.test.ts` | Cursor argv includes `--output-format stream-json`. Copilot argv includes `--output-format json` and no longer `--silent`. |

No new E2E. Do not assert daemon-log contents except that the live writer did not append there.

## Test data

Recorded chunks (each sent with a trailing newline):

| Preset | Chunk | Expect |
| --- | --- | --- |
| cursor | `{"type":"assistant","message":{"content":[{"type":"text","text":"Updating the button."}]}}` then `{"type":"tool_call","subtype":"started","tool_call":{"readToolCall":{"args":{"path":"src/Button.tsx"}}}}` | `Updating the button.\n` and `tool read src/Button.tsx\n`. Raw frames absent. |
| claude-code | `{"type":"assistant","message":{"content":[{"type":"text","text":"I'll read it."},{"type":"tool_use","name":"Read","input":{"file_path":"src/Button.tsx"}}]}}` | `I'll read it.\n` and `tool Read src/Button.tsx\n`. |
| copilot | `{"type":"assistant.message","data":{"content":"Hello"}}` then `{"type":"tool.execution_start","data":{"toolName":"bash","arguments":{"command":"npm test"}}}` | `Hello\n` and `tool bash npm test\n`. |
| codex | `{"type":"item.completed","item":{"type":"agent_message","text":"Done."}}` then `{"type":"item.started","item":{"type":"command_execution","command":"npm test"}}` | `Done.\n` and `tool command_execution npm test\n`. |
| opencode | `{"type":"text","part":{"text":"Updating the button."}}` then `{"type":"tool_use","part":{"tool":"bash","state":{"input":{"command":"npm test"}}}}` | `Updating the button.\n` and `tool bash npm test\n`. |

A system or result JSON line writes nothing. A non-JSON line is written unchanged, plus a newline.

## Test expectations

- Header and tool lines use the spellings above. No second writer in `run` or `runForeground`.
- `commandResult` for `echo ok` stays `ok\n` (platform echo newline), not the header or presented text.
- Path `Failure` does not throw out of the daemon line.
- Scaffold gitignore line is the exported `TRANSCRIPTS_GITIGNORE_LINE`, not a second string literal in the scaffold test's expected file body beyond the constant import.

## Test implementation details

- Core tests call `execBinary` / `executeStepsForContextList` with a temp git repo, same helpers as the history suite (`initTestGitRepo`, `echo` for the raw-result case, `node -e` for empty and failing commands).
- Sink tests pass an in-memory `write` and a `Map` of modules. They do not spawn a daemon.
- Preset tests import `presentOutput` from the preset module and call the factory once per case.
- Argv snapshots in `ensurePresetCommandsInstalled/unit.test.ts` gain the stream flags listed in E9.
