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
