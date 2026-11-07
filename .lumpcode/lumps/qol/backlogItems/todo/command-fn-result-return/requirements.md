# Requirements: `commandFn` may return an in-process result

| Field | Value |
| --- | --- |
| **Backlog** | `command-fn-result-return` · priority **2** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary `@lumpcode/core` (`CommandFn` type, `executeStepsForContextList`, `collectStepsForContext`). `@lumpcode/cli`: `lump-plan` human output and DOCS only. `@lumpcode/recipes` and presets unchanged. |

## Problem statement and motivation

A step's `commandFn` ([`CommandFn`](../../../../../../packages/core/src/types/CommandFn.ts)) returns a `CommandDescriptor` to spawn, or `null` / `undefined` / nothing to skip. A skip reaches `postCommandExecFn` with `commandResult: ''` and `commandSucceeded: true` and writes no `keepHistory` entry. A JS/TS step that already knows its outcome (it read a file, called an API, checked git) has two bad options today:

1. Spawn a throwaway process (`node -e`, `sh -c 'exit 1'`) only to carry a string and an exit code.
2. Skip, stash the outcome in `contextRunState`, and re-read it in `postCommandExecFn`. History records nothing, and a failure cannot fail the context or use `continueOnError`.

## Goals

1. `commandFn` may return `{ commandResult, commandSucceeded }` and the engine uses it as the step outcome without spawning.
2. The outcome flows exactly like a spawned command's: `keepHistory` entry, `postCommandExecFn` input, and `continueOnError` on failure.
3. The same union applies wherever a `CommandFn` is accepted: inline `command` on JS/TS steps, `commandFn` on core `Step`, and command modules.
4. `lump-plan --prompts` / `--plan` shows that a step resolved in-process.

## Non-goals

- Plain shell strings as a return (qol `command-as-shell-string`, `command-descriptor-or-string-returns`).
- Returning steps from `commandFn` (IDEAS `commandFn-return-step-or-result`, step half).
- Changing `CommandDescriptor`, skip semantics, or `postCommandExecFn` return types.
- Daemon transcript events for in-process results. No process runs, so `onCommandOutput` emits nothing, like a skip.
- JSON lump configs (no inline functions there).

## User stories / use cases

1. As a TS lump author, my verification step checks that the agent created a file and returns `{ commandResult: 'missing src/x.ts', commandSucceeded: false }`, so the context fails without a shell wrapper.
2. As an author with `continueOnError: true`, a failed in-process check reaches `postCommandExecFn`, which returns a retry step.
3. As an operator with `keepHistory: true`, I see the in-process outcome in the history file like any other step.

## Proposed behavior and UX

Contract in `packages/core/src/types/CommandFn.ts`:

| Name | Shape |
| --- | --- |
| `CommandFnResult` (new, exported from `@lumpcode/core` types) | `{ commandResult: string; commandSucceeded: boolean }` |
| `CommandFn` return | `MaybePromise<CommandDescriptor \| CommandFnResult \| null \| undefined \| void>` |

A returned object with an own `commandResult` key is a `CommandFnResult`; any other non-null object is a `CommandDescriptor`. An object with `commandResult` that is not a string, or `commandSucceeded` that is not a boolean, fails the step walk (`reason: 'stepWalkFailed'`). The message says `commandFn` returned an invalid result and names the expected shape.

Engine behavior per return value:

| Return | Spawn | `keepHistory` entry | `postCommandExecFn` input | Walk |
| --- | --- | --- | --- | --- |
| `CommandDescriptor` | yes | yes | spawn output (unchanged) | unchanged |
| nullish | no | no | `''`, `true` (unchanged) | continues |
| `CommandFnResult`, `commandSucceeded: true` | no | yes | the returned values | continues |
| `CommandFnResult`, `commandSucceeded: false`, `continueOnError: true` | no | yes | the returned values | continues |
| `CommandFnResult`, `commandSucceeded: false`, `continueOnError` falsy | no | no | not called | `stepWalkFailed`; message includes `commandResult` |

The failure row matches the spawn path: a hard step failure returns before history and `postCommandExecFn`. Abort handling is unchanged (`commandFn` is already raced against the signal).

`lump-plan` preview (`collectStepsForContext` → `CollectedStep`):

| Field | Value |
| --- | --- |
| `command` | `null` for a `CommandFnResult` (no process) |
| `inProcessResult` (new, optional) | `{ commandSucceeded: boolean }` when `commandFn` returned a `CommandFnResult`; omitted otherwise |

Human `lump-plan --prompts` prints `→ (in-process result, succeeded)` or `→ (in-process result, failed)` for those steps, and keeps `→ (command skipped)` for nullish.

## Technical approach

| Step | File | Change |
| --- | --- | --- |
| 1 | `packages/core/src/types/CommandFn.ts` | Add `CommandFnResult`; widen `CommandFn` return. |
| 2 | `packages/core/src/helpers/isCommandFnResult/` (`main.ts`, `index.ts`, export from `helpers/index.ts`) | `isCommandFnResult(value) → value is CommandFnResult`, plus validation of field types. This is the only discriminator. `executeStepsForContextList` and `collectStepsForContext` call it and do not reimplement the key check. |
| 3 | `packages/core/src/helpers/executeStepsForContextList/main.ts` | Branch on the guard before the spawn path, following the behavior table. History is written when a descriptor ran or a result was returned; the current `!!command` gate becomes "not nullish". |
| 4 | `packages/core/src/helpers/collectStepsForContext/main.ts` | Map a result to `command: null` + `inProcessResult`. |
| 5 | `packages/apps/cli/src/commands/lump-plan/main.ts` | Human line for `inProcessResult`. |

No CLI resolver change is needed: inline `command` functions and command modules are typed as core `CommandFn`.

## Testing strategy

| Level | Test | Covers |
| --- | --- | --- |
| Unit | `packages/core/src/helpers/isCommandFnResult/unit.test.ts` | Result vs descriptor discrimination; invalid field types rejected. |
| Unit | `packages/core/src/helpers/executeStepsForContextList/testing/general.unit.test.ts` | Success result: no spawn, `postCommandExecFn` gets the returned values, history entry written. Failure + `continueOnError: true`: walk continues with `commandSucceeded: false`. Failure without it: `stepWalkFailed`, no history, no `postCommandExecFn`. Invalid shape: `stepWalkFailed`. |
| Unit | `packages/core/src/helpers/collectStepsForContext/unit.test.ts` | `command: null` and `inProcessResult` for a result return. |
| Type | `packages/core/src/types/typedVariables.types.test.ts` | `CommandFn<V, SV>` returning a `CommandFnResult` compiles. |
| Unit | `packages/apps/cli/src/utils/jsConfigToRunLumpInput/testing/promptCommandSteps.unit.test.ts` | An inline JS `command` returning a result runs end to end through `runLump` without spawning. |
| Unit | `packages/apps/cli/src/commands/lump-plan/unit.test.ts` | Human output prints the in-process line. |

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/cli/DOCS/config/types.md` | `CommandFn` signature gains the result shape; the skip paragraph adds the in-process result row and its `continueOnError` / history behavior. |
| `packages/apps/cli/DOCS/author/agents.md` | Inline `CommandFn` bullet: third option, return `{ commandResult, commandSucceeded }` to finish in-process. |
| `packages/core/README.md` | `commandFn` row mentions the result shape. |

## Acceptance criteria

1. A JS/TS step returning `{ commandResult: 'ok', commandSucceeded: true }` spawns nothing, and its `postCommandExecFn` receives `commandResult: 'ok'`.
2. A failed result without `continueOnError` fails the context with `reason: 'stepWalkFailed'` and the message contains the result text.
3. With `keepHistory: true`, a result step appends one history entry; a nullish skip still appends none.
4. `lump-plan --prompts` shows the in-process line for that step.
5. The `commandResult` key check exists only in `isCommandFnResult`.
6. `npm run test -w=@lumpcode/core`, `npm run build -w=@lumpcode/cli`, and `npm run test -w=@lumpcode/cli` are green.
