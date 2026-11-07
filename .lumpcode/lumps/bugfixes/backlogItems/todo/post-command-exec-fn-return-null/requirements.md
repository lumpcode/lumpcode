# Requirements: `postCommandExecFn` cannot return `null`

| Field | Value |
| --- | --- |
| **Backlog** | `post-command-exec-fn-return-null` · priority **41** · type **fix** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | `@lumpcode/core` (type `PostCommandExecFn`), `@lumpcode/cli` (type `LumpJsConfigPostCommandExecFn`, re-exported by `@lumpcode/cli-types` / `cli-utils`), CLI DOCS, core README. No runtime change. `@lumpcode/recipes` unchanged. |

## Problem statement and motivation

`CommandFn` may return `null` / `undefined` / nothing to skip. `postCommandExecFn` is the sibling hook, but its return types reject `null`:

- core [`PostCommandExecFn`](../../../../../../packages/core/src/types/PostCommandExecFn.ts): `MaybePromise<void | Steps<V, SV>>`
- CLI [`LumpJsConfigPostCommandExecFn`](../../../../../../packages/apps/cli/src/types/LumpJsConfigPostCommandExecFn.ts): `MaybePromise<void | LumpJsConfigSteps<V, SV> | LumpJsConfigStepsItem<V, SV>>`

At run time `null` already works. `executeStepsForContextList` only walks returned steps when `returnedSteps != null && returnedSteps.length > 0`, and the CLI wrapper in `jsConfigToRunLumpInput` treats `returned == null` or `[]` as no follow-on steps. So the only defect is the type.

1. A TypeScript lump (or a `definePostCommandExecFn` helper) that writes `return commandSucceeded ? null : [retryStep]` fails `tsc`, so authors write `return undefined` or `return []` instead.
2. The hook is inconsistent with `CommandFn`, which documents `null` as a valid "nothing" value.

### Repro (strict `tsc --noEmit` over a file importing the source types)

```text
const a: PostCommandExecFn = () => null;
→ TS2322: Type 'null' is not assignable to type 'MaybePromise<void | Steps<LumpVariables, StepVariables>>'.

const b: LumpJsConfigPostCommandExecFn = async ({ commandSucceeded }) => (commandSucceeded ? null : []);
→ TS2322: Type 'Promise<never[] | null>' is not assignable to type 'MaybePromise<void | LumpJsConfigSteps<…> | LumpJsConfigStepsItem<…>>'.
```

Expected: both compile.

## Goals

1. `postCommandExecFn` may return `null`, `undefined`, nothing, `[]`, or follow-on steps, in core and in lump config types.
2. Docs state the same contract in the same words as `CommandFn` skip.

## Non-goals

- Any runtime change in `executeStepsForContextList`, `collectStepsForContext`, or `jsConfigToRunLumpInput`.
- New return shapes (a single `Step` in core, results, or commands). Distinct from qol `command-fn-result-return` and IDEAS `commandFn-return-step-or-result`.
- JSON lump configs (their `postCommandExecFn` is a module path; the module's default export follows the CLI type).

## User stories / use cases

1. As a TS lump author writing a verify loop, I return `null` when the suite is green and the next steps when it is red, and my config type-checks.

## Proposed behavior and UX

| Type | Return type after the fix |
| --- | --- |
| core `PostCommandExecFn<V, SV>` | `MaybePromise<Steps<V, SV> \| null \| undefined \| void>` |
| CLI `LumpJsConfigPostCommandExecFn<V, SV>` | `MaybePromise<LumpJsConfigSteps<V, SV> \| LumpJsConfigStepsItem<V, SV> \| null \| undefined \| void>` |

Input parameters are unchanged. `null`, `undefined`, nothing, and `[]` all mean "no follow-on steps; continue the walk".

## Technical approach

| Step | File | Change |
| --- | --- | --- |
| 1 | `packages/core/src/types/PostCommandExecFn.ts` | Widen the return type as above. |
| 2 | `packages/apps/cli/src/types/LumpJsConfigPostCommandExecFn.ts` | Widen the return type as above. `definePostCommandExecFn` and the `cli-types` re-export follow automatically. |
| 3 | `packages/apps/cli/DOCS/config/types.md` | Update the `PostCommandExecFn` signature block, and add one sentence next to the `CommandFn` skip paragraph: `postCommandExecFn` returns steps to run next, or `null` / `undefined` / nothing / `[]` to continue. |
| 4 | `packages/core/README.md` | `postCommandExecFn` row: add `null` to the no-op list. |

## Testing strategy

| Level | Test | Covers |
| --- | --- | --- |
| Type | `packages/core/src/types/typedVariables.types.test.ts` | A `PostCommandExecFn<V, SV>` returning `null` (sync and async) compiles. |
| Type | `packages/apps/cli/cli-utils/src/defineHelpers.types.test.ts` | `definePostCommandExecFn` accepting a fn that returns `null` or steps compiles. |
| Unit | `packages/core/src/helpers/executeStepsForContextList/testing/general.unit.test.ts` | A step whose `postCommandExecFn` returns `null` continues to the next step and runs no follow-on steps (locks in the current runtime). |
| Unit | `packages/apps/cli/src/utils/jsConfigToRunLumpInput/testing/promptCommandSteps.unit.test.ts` | An inline JS `postCommandExecFn` returning `null` resolves to a core hook that returns no steps. |

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/cli/DOCS/config/types.md` | Signature and one sentence (step 3). |
| `packages/core/README.md` | `postCommandExecFn` row (step 4). |

## Acceptance criteria

1. The repro snippets compile with `tsc --strict`.
2. No runtime file under `packages/core/src/helpers/` or `packages/apps/cli/src/utils/` changes behavior.
3. `npm run test -w=@lumpcode/core`, `npm run build -w=@lumpcode/cli`, and `npm run test -w=@lumpcode/cli` are green.
