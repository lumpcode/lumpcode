# Learnings

## Expected
`desc.yml` (`workflow: [manualReq, testImpl, impl]`, depends on `agent-sessions`): `workflow` on `LumpJsConfig` for TypeScript and JavaScript only, schema and config-load checks, `lump-plan` (`run: workflow`), the 2 hour default `timeoutMillis` for workflows, labeled transcript headers, and `contextResults` on the teardown hook input.

`requirements.md` testing strategy: config-loading tests for each check and its message; `lump-plan` tests for `run: workflow`, `--json`, and the `registerCommands` warning; `liveStepOutput` tests for prompt, shell, failure, log, and workflow-end headers, with steps output unchanged; a `run` of a TypeScript workflow fixture under `os.tmpdir()` that pushes a branch and passes one `ContextResult` per context to teardown; an e2e scenario in `npm run test:e2e:ci` for a packed-CLI foreground run and one daemon tick. No `testPlan.md` or `expect.yml` on this item or the parent. The parent `requirements.md` is the contract this ticket points at. This stage writes skipped tests and does not create `testPlan.md`.

## Landed
Working tree only. The marker commit for this stage does not exist yet.

Skipped tests:
- `packages/apps/cli/src/utils/jsConfigToRunLumpInput/testing/workflowConfig.unit.test.ts`
- `packages/apps/cli/src/commands/lump-plan/workflow.unit.test.ts`
- `packages/apps/cli/src/utils/lumpTranscriptFilePath/liveStepOutput.unit.test.ts` (`workflow transcript headers` describe). The steps cases in that file stay live.
- `packages/apps/cli/src/utils/runLumpFromLumpName/workflow.integration.test.ts`
- `packages/apps/cli/src/e2e/workflow-scenarios.test.ts`

## Adjustments
A workflow that omits `timeoutMillis` leaves that field unset on the resolved run input. Two hours stays the engine default. A configured value is copied onto the run input as the whole-workflow limit.

`lump-plan --prompts` for a workflow prints `run: workflow` and does not print a step count. A steps lump's `--json` payload gains `run: 'steps'`.

## impl Expected
`desc.yml` and `requirements.md` for this stage of `workflow: [manualReq, testImpl, impl]`: `workflow` on `LumpJsConfig` for TypeScript and JavaScript, loaded like other function fields. JSON has no `workflow` property and fails with `workflow needs a TypeScript or JavaScript config.` `workflow` with `steps` or `prompt` fails with `Use workflow or steps/prompt, not both.` A non-function fails with `workflow must be a function (got <type>).` `registerCommands` warns and still loads. `lump-plan` text and `--json` report the checks. The summary line is `run: workflow`. `--json` has `run: 'workflow' | 'steps'`. `--prompts` for a workflow prints `run: workflow` and no step count. Omitted `timeoutMillis` stays unset on the run input (engine default 2 hours). A set value is the whole-workflow limit. Transcript headers label prompt, shell, failure, log, and workflow end. Steps transcripts stay as they are. `postTeardownWorkspaceFn` receives `contextResults` (setup receives `[]`). Docs: `workflow` and the `timeoutMillis` defaults in the canonical lump config section. Unskip the five suites and make them pass. No `testPlan.md` or `expect.yml`. The parent `requirements.md` is the contract.

## impl Landed
Working tree only. The marker commit for this stage does not exist yet.

- `packages/apps/cli/src/types/LumpJsConfig.ts`
- `packages/apps/cli/src/types/LumpJsonConfig.ts` (`workflow` omitted from the JSON type)
- `packages/apps/cli/src/types/PostSetupWorkspaceFnInput.ts`
- `packages/apps/cli/cli-types/src/types.ts` (re-exports workflow, agent, shell, and result types)
- `packages/apps/cli/src/schemas/lumpConfig.schema.json` (no `workflow` property; `timeoutMillis` description covers both defaults)
- `packages/apps/cli/src/utils/validateLumpJsonConfig/main.ts`
- `packages/apps/cli/src/utils/jsConfigToRunLumpInput/main.ts`
- `packages/apps/cli/src/utils/planLumpFromJsConfig/main.ts`
- `packages/apps/cli/src/commands/lump-plan/main.ts`
- `packages/apps/cli/src/utils/lumpTranscriptFilePath/liveStepOutput.ts`
- `packages/apps/cli/src/utils/composeLumpWorkspaceFns/main.ts`
- `packages/apps/cli/DOCS/config/lump.md` (the canonical lump config section; there is no `DOCS/reference/` field page)
- `packages/apps/cli/src/utils/jsConfigToRunLumpInput/testing/workflowConfig.unit.test.ts` (unskipped)
- `packages/apps/cli/src/commands/lump-plan/workflow.unit.test.ts` (unskipped)
- `packages/apps/cli/src/utils/lumpTranscriptFilePath/liveStepOutput.unit.test.ts` (unskipped `workflow transcript headers`)
- `packages/apps/cli/src/utils/runLumpFromLumpName/workflow.integration.test.ts` (unskipped)
- `packages/apps/cli/src/e2e/workflow-scenarios.test.ts` (unskipped)
- `packages/apps/cli/src/utils/composeLumpWorkspaceFns/unit.test.ts` (hook-bag equality now includes `contextResults: []`)
- `packages/recipes/src/kit/openPrPostTeardown/unit.test.ts` (the hook fixture supplies `contextResults: []` so it matches the required field)
- `.lumpcode/lumps/backlog/backlogItems/todo/workflow-api/tickets/config-and-plan/learnings.md`

`defineConfig` already takes `LumpJsConfig`, and `cli-utils` re-exports `cli-types`, so the define-helper sources were not edited. The repo `defineLump` template was not edited. It accepts `LumpJsConfig`.
