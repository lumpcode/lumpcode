# Learnings

## Expected
`desc.yml` (`workflow: [manualReq, testImpl, impl]`, no `dependsOn`): `@lumpcode/core` runs `RunLumpInput.workflow` as one internal step through `workflowToSteps`, with `WorkflowFn`, `WorkflowInput`, `WorkflowResult`, `Agent`, `Shell`, abort and timeout binding, parallel calls, a `ContextResult` for every context, and the new history entries and output events. Steps lumps behave as today.

`requirements.md`: the testing strategy is `workflowToSteps/unit.test.ts` (one internal step, `timeoutMillis` carried), `createWorkflowRuntime` against real processes under `os.tmpdir()` (shell string and descriptor, non-zero exit, call timeout, workflow timeout, parallel indexes and unmixed chunks, busy session), `runLump` on a git fixture (outcome table, `variables` in history `stepVariables`, `ContextResult` for workflow and steps), and `typedVariables.types.test.ts` for `WorkflowFn<V, SV>`. Acceptance: `shell('echo ok')` commits, pushes, and the context is `branchPushed`; each outcome row; a workflow with no `timeoutMillis` aborts after 2 hours (injected clock or short override) while steps keep 30 minutes; `workflowFn` / `WorkflowStep` are not public; existing core tests stay green. No `testPlan.md` or `expect.yml`. The parent `requirements.md` is the type contract this ticket points at. This stage writes skipped tests and does not create `testPlan.md`.

## Landed
Working tree only. The marker commit for this stage does not exist yet.

Skipped tests:
- `packages/core/src/helpers/workflowToSteps/unit.test.ts`
- `packages/core/src/helpers/createWorkflowRuntime/unit.test.ts`
- `packages/core/src/usages/runLump/workflow.unit.test.ts`
- `packages/core/src/types/typedVariables.types.test.ts` (workflow describe). The live C5 assertion now expects `steps` to be optional.

So those suites can load and typecheck, this stage also adds the public types (`Workflow.ts`, `Agent.ts`, `Shell.ts`, `ContextResult.ts`, plus the history, event, failure, `CommandFn`, `SetupFn`, and `GitAndWorkspaceFnsInput` fields), throwing `workflowToSteps` and `createWorkflowRuntime` modules, an empty `contextResults` array on the workspace hook input, and a `runLump` guard. `workflow` together with `steps` fails with `Use workflow or steps, not both.`; a workflow-only call returns `RunLumpInput.workflow is not implemented.`

The new event kinds need three CLI edits or that package no longer typechecks against core source: `liveStepOutput.ts` ignores non-chunk events, `planLumpFromJsConfig` passes `contextResults: []`, and `LumpJsConfig` omits `workflow` and `createAgent` from the mapped config.

## Gap
The requirements name `@lumpcode/core` only and ask for skipped tests. The types, throwing helpers, `runLump` guard, and the three CLI edits are here so the skipped suites import and the repo still typechecks. A workflow-only run does not execute yet.

## impl Expected
`desc.yml` (`workflow: [manualReq, testImpl, impl]`, no `dependsOn`) and `requirements.md`: `@lumpcode/core` runs `RunLumpInput.workflow` as one internal step through `workflowToSteps`, with shell and agent calls on the step executor, the outcome table, a `ContextResult` for every context, and the new history entries and events. Steps lumps stay as they are. A workflow with no `timeoutMillis` aborts after 2 hours; steps keep 30 minutes. `workflowFn` / `WorkflowStep` stay unexported. No `testPlan.md` or `expect.yml` on this item. The parent `requirements.md` is the type contract. This stage unskips the tests and makes them pass. Docs: a short ontology note that a workflow is one step and outcomes come from `WorkflowResult`.

## impl Landed
Working tree only. The marker commit for this stage does not exist yet.

- `packages/core/src/helpers/workflowToSteps/main.ts`
- `packages/core/src/helpers/createWorkflowRuntime/main.ts`
- `packages/core/src/helpers/executeStepsForContextList/main.ts`
- `packages/core/src/usages/runLump/main.ts`
- `packages/core/src/helpers/workflowToSteps/unit.test.ts` (unskipped)
- `packages/core/src/helpers/createWorkflowRuntime/unit.test.ts` (unskipped)
- `packages/core/src/usages/runLump/workflow.unit.test.ts` (unskipped)
- `packages/core/src/types/typedVariables.types.test.ts` (unskipped). The shell and agent `expectTypeOf` calls are wrapped in a function that is not invoked, because `expectTypeOf` evaluates its argument and those values are null.
- `.agents/memory/ontology/steps.md`
- `.agents/memory/ontology/context-status.md`
