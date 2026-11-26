# Requirements: Workflow in the core engine

| Field | Value |
| --- | --- |
| **Backlog** | `workflow-api` / `core` · priority **11** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Contract** | `../../requirements.md` (Interfaces: workflow, agent, shell, results, history, events, time limits) |
| **Packages** | `@lumpcode/core` only. The CLI and recipes are later tickets. |

## Problem statement and motivation

`runLump` only runs steps. Loops, sessions and push decisions are encoded as steps returned from steps. This ticket lets a library user call `runLump({ …, workflow })` and get one function that runs as the context's single step, with the same workspace, git lock, commit, marker, push, hooks and abort as steps.

## Goals

1. `RunLumpInput.workflow` runs through the existing step walk, as one internal step.
2. `shell` and agent calls go through the step executor: streaming, timeout, process-tree kill, history.
3. The workflow's result decides the outcome (umbrella table), with no fake steps.
4. Every context, steps or workflow, produces a `ContextResult`.
5. Steps lumps behave exactly as today.

## Non-goals

- Command modules, presets, `agent.session('cursor')` by tag (`agent-sessions`).
- `LumpJsConfig`, schema, `lump-plan`, transcript header text (`config-and-plan`).
- A steps-on-workflow adapter. Mixing steps and workflow.

## Proposed behavior

### Agent injection (the one hook the CLI uses)

Core owns the `Agent` interface and runs calls; the host decides what a command tag means.

```ts
// RunLumpInput: NEW (both optional)
workflow?: WorkflowFn<V, SV>;
createAgent?: (input: CreateAgentInput<V>) => Agent;

export interface CreateAgentInput<V extends LumpVariables = LumpVariables> {
  context: Context;
  lumpVariables: V;
  contextRunState: ContextRunState;
  projectRoot: string;
  workspacePath: string;
  /** Runs one agent call through the step executor: history entry, output events, abort, timeout, one-prompt-per-session lock. */
  runAgentCall(input: {
    commandFn: CommandFn<V>;
    commandName: string;
    prompt: string;
    sessionId: string;
    stepVariables: StepVariables;       // model, agentPermissions, extraArgs mapped from PromptOptions
    timeoutMillis?: number;
    label?: string;
  }): Promise<AgentResult>;
}
```

Without `createAgent` (plain library use), core builds a default `Agent`: `session(commandFn)` and `session({ command: commandFn })` work, with a UUID `sessionId`; a string command fails with `Command tags like "<tag>" need a host that resolves them (the Lumpcode CLI); pass a CommandFn.`; the default command is the lump's step command when it is a function.

### Running the workflow step

1. `runLump` calls `workflowToSteps(workflow, timeoutMillis)` when `workflow` is set; `workflow` with `steps` is a `Failure`.
2. The walk meets `{ kind: 'workflow' }` at `stepIndex` `[0]`. It builds `shell` and `agent` bound to one signal: `AbortSignal.any([runSignal, AbortSignal.timeout(timeout)])`, where `timeout` is the step's `timeoutMillis`, else the run's `timeoutMillis`, else **2 hours** (steps keep 30 minutes).
3. Each inner call takes the next index `n` when it starts (`[0, n]`, from 1), emits `start` / `chunk` / `end`, and appends a history entry (`kind`, `label`, `command`, `sessionId`).
4. Concurrent calls: chunks are buffered per call and emitted when the call ends, in end order; `start` events are emitted live. With one call in flight, chunks stream as today.
5. A second `prompt` on a session with one in flight fails (umbrella error text).
6. On return, the result is normalized and stored: `variables` become the step's `stepVariables`; a `kind: 'workflow'` history entry and a `workflowEnd` event carry it.
7. Outcome: `push: false` → `'workflowNotPushed'`; a throw → `'workflowThrew'`; both take the existing step-walk failure path (no commit, context stays `toDo`). An abort takes today's abort path. Otherwise commit and push as after steps.
8. `log(message)` emits a `log` event and writes to the run logger.

### Context results

`executeStepsForContextList` records one `ContextResult` per context, for steps lumps too (`{ succeeded: true, push: true }` on success; the step-walk failure message on failure). They are returned in the run result and passed to the teardown hook input as `contextResults` (the CLI exposes them in `config-and-plan`).

## Technical approach

| Step | Files | Change |
| --- | --- | --- |
| 1 | `src/types/Workflow.ts`, `Agent.ts`, `Shell.ts`, `ContextResult.ts` (new), `types/index.ts` | Public types from the umbrella contract |
| 2 | `src/types/HistoryEntry.ts`, `CommandOutputEvent.ts`, `ExecuteStepsFailureReason.ts`, `CommandFn.ts` (`sessionId?` input), `SetupFn.ts` (`sessionId?` output) | Additive fields |
| 3 | `src/usages/runLump/main.ts` | `workflow`, `createAgent` in `RunLumpInput`; exclusivity with `steps`; `workflowToSteps` |
| 4 | new `src/helpers/workflowToSteps/` | **Single owner** of the conversion and the internal `WorkflowStep` type (not exported from the package) |
| 5 | new `src/helpers/createWorkflowRuntime/` | **Single owner** of the bound signal, call numbering, per-call buffering, the session lock, `shell` (on `execBinary`), the default `Agent`, `runAgentCall` |
| 6 | `src/helpers/executeStepsForContextList/main.ts` | Handle `kind: 'workflow'`; record `ContextResult`s; no change to the classic step branch |

## Testing strategy

| Level | Test | Covers |
| --- | --- | --- |
| Unit | `workflowToSteps/unit.test.ts` | One internal step; `timeoutMillis` carried |
| Integration | `createWorkflowRuntime` with real processes under `os.tmpdir()` | `shell` string and descriptor; non-zero exit returns `succeeded: false`; call timeout returns `timedOut: true`; workflow timeout throws `AbortError` and kills in-flight calls; parallel calls get distinct indexes and unmixed chunks; second prompt on a busy session fails |
| Integration | `runLump` with a git fixture under `os.tmpdir()` | Each row of the umbrella outcome table; `variables` land in history `stepVariables`; `ContextResult` for workflow and steps lumps |
| Regression | existing `executeStepsForContextList` and `runLump` tests | Unchanged for steps |
| Type | `typedVariables.types.test.ts` | `WorkflowFn<V, SV>` infers `lumpVariables` and `variables` |

## Docs updates

None user-facing in this ticket (`workflow-first-docs-and-website`). Update `.agents/memory/ontology/` step and status notes with "a workflow is one step; outcomes from `WorkflowResult`".

## Acceptance criteria

1. `runLump({ …, workflow })` with a fixture runs `shell('echo ok')`, commits, pushes, and the context becomes `branchPushed`.
2. Each umbrella outcome row behaves as stated.
3. A workflow with no `timeoutMillis` is aborted after 2 hours (tested with an injected clock or short override); a steps lump keeps 30 minutes.
4. No public export of `workflowFn` / `WorkflowStep`; the public `Step` type is unchanged.
5. All existing core tests pass unchanged.
