# PRD: History files as YAML (`keepHistory`)

| Field | Value |
| --- | --- |
| **Backlog** | `history-as-yaml` · priority **1** · type **feature** |
| **Release goal** | [GOALS.md](../GOALS.md) — v0.0.7 QOL |
| **Depends on** | None (benefits from `lumpHistoryFilePath` util already in `packages/apps/cli`) |
| **Packages** | `packages/core` (primary — read/write in `executeStepsForContextList`); `packages/apps/cli` (path helper, docs, `AGENTS.md`); `packages/core/README.md` |

## Problem statement and motivation

Lumpcode can persist per-context prompt run logs when a lump sets **`keepHistory: true`**. Today the engine appends each step to a **JSON array** at `.lumpcode/lumps/<lumpName>/history/<contextName>.json`.

That format is a poor fit for the data being stored:

1. **Long prompts and agent output** — Prompts and `commandResult` strings are often multi-paragraph (templates, file excerpts, tool transcripts). JSON forces escaped newlines (`\n`), quotes, and backslashes, producing files that are hard to read in an editor or diff tool.
2. **Debugging friction** — Operators open history files to inspect what was sent to the agent and what came back. Dense JSON discourages manual review and makes copy-paste into another tool error-prone.
3. **Inconsistent with repo conventions** — This monorepo already uses YAML for human-edited task lists (`TODO.yaml`, `DONE.yaml`, lump `getContextListFn` loaders). History is the same class of artifact: local, gitignored, human-inspected run logs.

The lump config flag and write semantics should stay the same; only the **on-disk serialization** and **default file extension** change.

## Goals

1. **YAML as the history format** for CLI-managed paths: `.lumpcode/lumps/<lumpName>/history/<contextName>.yaml`.
2. **Readable multi-line fields** — Serialize `prompt` and `commandResult` (and other long string fields when applicable) using YAML block scalars so newlines appear literally in the file.
3. **Preserve entry semantics** — Each appended element remains the same shape as `PostCommandExecFn` input (`commandResult`, `commandSucceeded`, `context`, `prompt`, `stepIndex`, `contextRunState`, `lumpVariables`, optional `stepVariables`, `projectRoot`). No new fields; no change to when history is written (still only when a command actually runs — not when `commandFn` returns `null`).
4. **Preserve write ordering** — History is still appended **before** an optional `postCommandExecFn` on the same step.
5. **Documentation** — Update user-facing CLI docs and core README to describe `.yaml` paths and show a representative example.
6. **Library contract** — `@lumpcode/core` `getKeepHistoryFilePathFn` remains a path string; history is always read and written as YAML (`.yaml` or `.yml` extension).

## Non-goals

- **New lump config options** — No `historyFormat`, `historyPath`, or CLI flags. `keepHistory: true` stays a boolean.
- **History CLI subcommands** — No `lumpcode history show`, export, or prune commands in this task.
- **Changing gitignore rules** — `project-setup` already ignores `.lumpcode/**/history/`; the pattern covers `.yaml` files.
- **Compressing or rotating history** — No size limits, truncation, or per-step file split.
- **Encrypting or redacting secrets** — History may still contain credentials from agent output; privacy guidance in docs stays as-is.
- **Schema validation of history files** — No JSON Schema or Zod for history entries; best-effort parse errors surface as run failures.
- **Renaming `ContextRunHistoryJson`** — That CLI type (`chatHistory`-shaped) is unrelated to engine `keepHistory`; leave it unless a separate cleanup task targets it.
- **Changing `contextStatusRecord.json`** — Status cache stays JSON.

## User stories / use cases

1. **Operator debugging a failed context** — I open `.lumpcode/lumps/myLump/history/feature-x.yaml` in my editor and read the prompt and agent output as plain text without decoding JSON escapes.
2. **Resumable agent sessions** — I inspect `contextRunState` in the latest history entry (e.g. `cursorSetup`, `copilotSetup`) to verify chat/session ids persisted across steps; nested objects remain readable in YAML.
3. **Monorepo maintainer** — Lumps such as `loop-example`, `findAbstraction`, and `v0.0.7` that set `keepHistory: true` produce `.yaml` history under the project workspace.

## Docs updates

Update path literals and format references (JSON → YAML, `.json` → `.yaml`) in:

| Document | What to change |
| --- | --- |
| [packages/apps/cli/DOCS/lump-config.md](../../../../packages/apps/cli/DOCS/lump-config.md) | Lump folder tree, `keepHistory` field table, § Prompt run history (layout, entry shape, example snippet) |
| [packages/apps/cli/DOCS/get-started.md](../../../../packages/apps/cli/DOCS/get-started.md) | Paths table row for prompt run history |
| [packages/apps/cli/DOCS/concepts.md](../../../../packages/apps/cli/DOCS/concepts.md) | Mermaid node label and prose under resumable runs |
| [packages/core/README.md](../../../../packages/core/README.md) | `getKeepHistoryFilePathFn` section — default CLI path and format |
| [AGENTS.md](../../../../AGENTS.md) | Workspace fact for `keepHistory` file path/extension |

Do **not** add internal helper names (`readHistoryFile`, `js-yaml`, etc.) to user-facing docs. Optional: a short YAML example block in `lump-config.md` showing `prompt` and `commandResult` as literal block scalars.

`packages/apps/cli/DOCS/types.md` — only update if it still says "JSON" in the `keepHistory` sentence; entry shape table can stay (field names unchanged).

No change to `COMMANDS.md` (no new commands). No change to `lumpConfig.schema.json` (`keepHistory` remains `boolean`).

## Proposed behavior and UX

### Lump config (unchanged)

```json
{
  "contextListJson": { "FILE": "src/{NAME}.ts" },
  "keepHistory": true,
  "prompt": {
    "promptTemplate": "Improve @{FILE}",
    "command": "copilot"
  }
}
```

Same for `config.js` / `config.ts` via `defineConfig`. No CLI syntax changes — `lumpcode run`, `lumpcode start`, and daemon ticks behave as today.

### File layout

```text
.lumpcode/lumps/<lumpName>/history/<contextName>.yaml
```

- **One file per context** — top-level YAML **sequence** (array); each step appends one mapping (object).
- Parent directories are still created with `mkdir(..., { recursive: true })` before the initial empty file write.
- Initial empty file content: `[]` (valid YAML empty array).

### Entry shape (unchanged semantics)

Each sequence item matches `PostCommandExecFn` input:

| Field | Description |
| --- | --- |
| `commandResult` | Agent stdout/stderr combined (often large; may contain secrets) |
| `commandSucceeded` | `true` when the subprocess succeeded; `false` when it failed but `continueOnError` allowed the step to continue |
| `context` | Context object (`name`, `variables`, optional `options`) |
| `prompt` | Resolved prompt string sent to the agent |
| `stepIndex` | Root index (`number`) or nested path (`number[]`, e.g. `[1, 0]`) |
| `contextRunState` | Mutable per-context bag (may nest preset setup keys) |
| `lumpVariables` | Lump-level variables from config |
| `stepVariables` | Per-step variables, when set |
| `projectRoot` | Absolute project root path |

### Example history file

```yaml
- commandSucceeded: true
  prompt: |
    Refactor src/Button.tsx for accessibility.
    Focus on keyboard navigation and ARIA labels.
  commandResult: |
    Updated Button.tsx: added role="button", tabIndex, and onKeyDown handler.
  context:
    name: button
    variables:
      FILE: src/Button.tsx
  stepIndex: 0
  contextRunState:
    copilotSetup:
      setupChatId: a1b2c3d4-...
  lumpVariables: {}
  projectRoot: /Users/me/my-app
- commandSucceeded: true
  prompt: Run tests and fix failures.
  commandResult: "All tests passed."
  context:
    name: button
    variables:
      FILE: src/Button.tsx
  stepIndex: 1
  contextRunState:
    copilotSetup:
      setupChatId: a1b2c3d4-...
  lumpVariables: {}
  projectRoot: /Users/me/my-app
```

Short single-line `prompt` / `commandResult` values may use plain or quoted scalars; multi-line values **must** use literal block style (`|`).

### When history is written (unchanged)

| Condition | History appended? |
| --- | --- |
| `keepHistory` false / omitted | No |
| `getKeepHistoryFilePathFn` returns `undefined` | No |
| `commandFn` returns `null` (skipped command) | No |
| Command runs (success or `continueOnError` failure) | Yes |

### Supported extensions

| Path extension | Read | Write |
| --- | --- | --- |
| `.yaml`, `.yml` | YAML parse | YAML dump (block scalars for long strings) |
| Other | Error with clear message | — |

Custom `getKeepHistoryFilePathFn` implementations must return a `.yaml` or `.yml` path.

## Technical approach

### Affected code (today)

| Location | Role |
| --- | --- |
| [`packages/core/src/helpers/executeStepsForContextList/main.ts`](../../../../packages/core/src/helpers/executeStepsForContextList/main.ts) | Inline `JSON.parse` / `JSON.stringify`, initial `"[]"` write |
| [`packages/apps/cli/src/utils/lumpHistoryFilePath/main.ts`](../../../../packages/apps/cli/src/utils/lumpHistoryFilePath/main.ts) | Returns `…/history/<contextName>.json` |
| [`packages/apps/cli/src/utils/jsConfigToRunLumpInput/main.ts`](../../../../packages/apps/cli/src/utils/jsConfigToRunLumpInput/main.ts) | Wires `keepHistory` → `lumpHistoryFilePath` |

### `packages/core`

1. **Add dependency** — `js-yaml` (v5, aligned with monorepo root) as a **runtime** dependency of `@lumpcode/core`. Rollup must bundle it into `dist/` (same as today for `ignore`).
2. **Extract helpers** (suggested paths under `packages/core/src/utils/`):
   - `readHistoryFile({ filePath })` → `PostCommandExecFn`-shaped entry array (or shared type alias).
   - `writeHistoryFile({ filePath, entries })`.
   - `appendHistoryEntry({ filePath, entry })` — encapsulates mkdir-on-first-write, read-modify-write.
   - `historyFormatFromPath(filePath)` — returns `'yaml'` for `.yaml`/`.yml`, errors otherwise.
3. **Replace inline JSON** in `executeStepsForContextList` with `appendHistoryEntry`.
4. **YAML dump options** — Use `js-yaml` `dump` with settings that favor readability:
   - `lineWidth: 0` (avoid arbitrary wrapping of block scalars).
   - Custom replacer or post-process: for string values on keys `prompt` and `commandResult` (and any string containing `\n`), prefer literal block style.
   - Preserve key order stable enough for readable diffs (document order in helper; exact order not user-facing).
5. **Errors** — Parse failures return structured failure from the step walk (same as other unexpected errors), with a message that includes the history file path — do not throw uncaught from the SEA bundle.

### `packages/apps/cli`

1. **`lumpHistoryFilePath`** — Change extension from `.json` to `.yaml`.
2. **Tests** — Update expected paths in `lumpHistoryFilePath/unit.test.ts`, `jsConfigToRunLumpInput` keepHistory tests, and integration test that reads history after `runLump` (assert YAML parse, same field values).
3. **SEA / ncc** — Verify `js-yaml` resolves through the core bundle inside the CLI binary (no new external unless build already externalizes it; prefer bundled).

### `packages/core/README.md`

Update `getKeepHistoryFilePathFn` default path and mention YAML sequence format.

### `AGENTS.md`

Update the `keepHistory` workspace fact: `.yaml` extension, YAML serialization.

### Out of scope for implementer

- Editing [`.lumpcode/lumps/v0.0.7/TODO.yaml`](../TODO.yaml) (move to `DONE.yaml` in a separate commit when the feature ships).

## Acceptance criteria

1. **Default path** — With `keepHistory: true`, CLI resolves history to `.lumpcode/lumps/<lumpName>/history/<contextName>.yaml` (not `.json`).
2. **Append semantics** — Multi-step runs produce a YAML sequence with one entry per executed command step; entry fields match current `PostCommandExecFn` input.
3. **Readability** — A history entry whose `prompt` or `commandResult` contains newlines is stored with literal block scalars (`|`), not JSON-style `\n` escapes.
4. **Skip unchanged** — No history file created when `commandFn` returns `null`.
5. **Docs** — User-facing docs listed in [Docs updates](#docs-updates) reference `.yaml` and show or describe the sequence-of-mappings layout; no stale `.json` default paths.
6. **Published core** — `@lumpcode/core` lists `js-yaml` in `dependencies` and ships working history helpers in `dist/`.

## Open questions and risks

| # | Question / risk | Mitigation |
| --- | --- | --- |
| 1 | **`.yaml` vs `.yml`** | Standardize on **`.yaml`** for CLI default (matches backlog name and `TODO.yaml`). Accept `.yml` in `historyFormatFromPath` only. |
| 2 | **Bundle size** | `js-yaml` adds weight to core and SEA. Accept for v0.0.7; avoid duplicating a second YAML library in CLI. |
| 3 | **Concurrent append** | Two processes appending the same history file can still race (same as today). Document as known limitation; out of scope. |
| 4 | **Very large histories** | Whole-file read-modify-write loads entire history each step. Same as today; no regression. |
| 5 | **YAML parse surprises** | Untrusted content is local gitignored output from Lumpcode itself. Parse failures fail the run with a clear path in the error. |
| 6 | **`contextRunState` serialization** | May contain `undefined`-like holes or non-JSON values; define dump behavior (omit keys vs `null`) for consistent round-trips. |
| 7 | **Hand-edited history** | Users may edit YAML between runs; invalid edits cause parse errors on next append. Acceptable for debug-only files. |
