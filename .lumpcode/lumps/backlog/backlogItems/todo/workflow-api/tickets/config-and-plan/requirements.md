# Requirements: `workflow` in lump configs, checks and transcripts

| Field | Value |
| --- | --- |
| **Backlog** | `workflow-api` / `config-and-plan` · priority **13** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | `agent-sessions` |
| **Contract** | `../../requirements.md` (CLI: config and hooks; core: events) |
| **Packages** | `@lumpcode/cli` (primary: `types/LumpJsConfig.ts`, `types/PostSetupWorkspaceFnInput.ts`, `schemas/lumpConfig.schema.json`, config loading, `commands/lump-plan`, `utils/lumpTranscriptFilePath/liveStepOutput.ts`). `cli-utils` / `cli-types` re-export the types. |

## Problem statement and motivation

After `core` and `agent-sessions`, a library user can run a workflow, but a lump author cannot: `LumpJsConfig` has no `workflow`, `lump-plan` does not know it, transcripts label calls by step number only, and teardown hooks cannot see how a context ended.

## Goals

1. `export default defineLump({ …, async workflow({ agent, shell }) { … } })` runs with `lumpcode run` and the daemon.
2. Invalid combinations fail at load and in `lump-plan` with clear messages.
3. Transcripts read as a story of labeled calls.
4. `postTeardownWorkspaceFn` receives `contextResults`.

## Non-goals

- Kit helpers and `openPrPostTeardown` changes (`kit`). Recipes (`recipes`). Scaffolding stubs (`factory-templates-ts-default-scaffolding`).

## Proposed behavior

### Config

`workflow?: FilePath | WorkflowFn<V, SV>` in `LumpJsConfig`, loaded like other function fields (a `FilePath` module's default export). `defineLump` and the `define*` helpers in `cli-utils` type it. `timeoutMillis` limits the whole workflow; omitted means 2 hours for a workflow lump (the engine default from `core`).

### Checks (config loading and `lump-plan`)

The umbrella "Check" table. `lump-plan` text and `--json` both report them; the summary line shows `run: workflow`, and `--json` gains `run: 'workflow' | 'steps'`.

### Transcripts

`createLiveStepOutput` writes, for workflow events:

```text
── <context> · 0.<n> prompt · <label> (<command>, session <first 8 chars>…) ──
<presentOutput of the command>
── <context> · 0.<n> shell · <label> ──
<raw output>
✗ exit <code> | ✗ timed out          (only on failure)
· log: <message>
══ <context> · workflow: <succeeded|failed>, <pushed|not pushed> · "<message>" ══
```

Steps lumps' transcripts are unchanged.

### Hooks

`PostSetupWorkspaceFnInput.contextResults: ContextResult[]`: the branch's contexts in run order for teardown, `[]` for setup. `postTeardownWorkspaceCommand` is unchanged.

## Technical approach

| Step | Files | Change |
| --- | --- | --- |
| 1 | `src/types/LumpJsConfig.ts`, `cli-utils` define helpers, `cli-types` exports | `workflow` field and re-exported workflow, agent, shell and result types |
| 2 | `src/schemas/lumpConfig.schema.json` | No `workflow` property in JSON; the JSON loader error for it uses the umbrella message |
| 3 | config resolve / `jsConfigToRunLumpInput` | Load `workflow`, pass it and `timeoutMillis` to `runLump`; the exclusivity and type checks; the `registerCommands` warning |
| 4 | `src/commands/lump-plan` | Checks, `run:` line, `--json` field |
| 5 | `src/utils/lumpTranscriptFilePath/liveStepOutput.ts` | Headers for `callKind`, `log`, `workflowEnd` events |
| 6 | `src/types/PostSetupWorkspaceFnInput.ts` and the hook callers | `contextResults` from the run result |

## Testing strategy

| Level | Test | Covers |
| --- | --- | --- |
| Unit | config loading tests | Each check row and its message |
| Unit | `lump-plan` tests | `run: workflow`, `--json`, the warning |
| Unit | `liveStepOutput` tests | Header text for prompt, shell, failure, log, workflow end; steps output unchanged |
| Integration | `run` on a TypeScript workflow fixture under `os.tmpdir()` | Pushes a branch; teardown hook receives one `ContextResult` per context |
| E2E | new scenario in `npm run test:e2e:ci` | A workflow lump through the packed CLI, foreground run and one daemon tick |

## Docs updates

`DOCS/reference/` lump config fields: `workflow` and the `timeoutMillis` defaults, in the canonical config section. The narrative page comes with `workflow-first-docs-and-website`.

## Acceptance criteria

1. The umbrella example runs with `lumpcode run` and with `lumpcode start`.
2. Every check row produces its message, in `lump-plan` text and JSON.
3. A transcript for the example shows each call with its label, and the final workflow line.
4. `postTeardownWorkspaceFn` sees `outcome` and `result.message` for each context.
5. Steps lumps' `lump-plan` and transcripts are unchanged.
