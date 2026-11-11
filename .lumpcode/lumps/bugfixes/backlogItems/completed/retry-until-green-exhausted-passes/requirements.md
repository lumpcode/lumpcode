# Requirements: exhausted retryUntilGreen records the failure and still pushes

| Field | Value |
| --- | --- |
| **Backlog** | `retry-until-green-exhausted-passes` · priority **20** · type **fix** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary: `@lumpcode/recipes` (`src/kit/getRecursiveSteps.ts`, `src/kit/retryUntilGreen.ts`). Docs in `@lumpcode/cli` (`DOCS/author/prompts.md`, `DOCS/examples/building-blocks.md`, `DOCS/author/recipes.md`). `@lumpcode/core` unchanged. |

## Problem statement and motivation

`getRecursiveSteps` (what `retryUntilGreen`, `featureBacklog`, and `abstractionBacklog` use) caps the loop on `stepIndex` nesting depth. Core passes the full nesting path as `stepIndex`, and each retry nests one level deeper. Once that depth passes `maxIterations`, `commandFn` returns `{ executable: 'echo', args: ['Loop limit reached'] }`, which exits 0. `postCommandExecFn` then returns nothing. The walk ends as if the check passed.

The real check never runs as a final red attempt, and nothing records that validation failed. A nested caller (a recipe stage is a dynamic step function) hits the depth cap one iteration sooner than a top-level `steps` array, so the same `maxIterations` does not mean the same number of checks.

Repro (a scratch Vitest file in `packages/recipes/src/kit/`, run with `npx vitest run <file>` and then deleted): call `executeStepsForContextList` from `@lumpcode/core` on a temp git repo. Use recording `gitAddCommitFn` / `gitPushFn` stubs and `steps: retryUntilGreen({ steps: [{ commandFn: () => ({ executable: 'true', args: [] }) }], validationCommandFn: () => ({ executable: 'sh', args: ['-c', 'echo red; exit 1'] }) })` with the default `maxIterations` (5).

| Case | Actual |
| --- | --- |
| `retryUntilGreen` as the top-level `steps` | `success: true`, events `[commit, push]`, check ran 5 times, last iteration ran `echo "Loop limit reached"` |
| Same steps returned from a dynamic step function, as `backlog` / `featureBacklog` stages do | `success: true`, events `[commit, push]`, check ran only 4 times |

The published docs describe the opposite of what we want as the default. [Prompts](../../../../../../packages/apps/cli/DOCS/author/prompts.md#validate-and-retry) and [Building blocks](../../../../../../packages/apps/cli/DOCS/examples/building-blocks.md#retry-until-green) say a still-red last attempt fails the context, with no commit and no push. Failing the context drops the branch workspace on teardown, so the agent's edits and the red output are gone. The branch should be pushed so that work can be reviewed. Withholding the push is an opt-in.

## Goals

1. The number of real check runs depends only on `maxIterations`, not on how deeply the steps are nested. No attempt replaces the user's check with a command that always succeeds.
2. When the loop stops, `lumpVariables.__VALIDATION_FAILED__` is a boolean: `true` if the last check was still red, `false` if a check passed.
3. By default the context still succeeds after a red last check, so core commits and pushes the branch. The work and the failure stay on the remote.
4. `pushOnValidationFailure: false` withholds that push by failing the context after the flag is set.

## Non-goals

- Changing core's `stepIndex` shape, the step walker, or `GitPushFn`. Withholding the push reuses the existing `stepWalkFailed` path (no commit, no push, remaining steps in the context do not run).
- Changing `maxIterations`' default (5), the default fix prompt, or the `fixSteps` / `isValidationCommandResultOk` options.
- Teaching `folderSetTaskDoneStep`, `featureBacklog`, or `abstractionBacklog` to read the flag or to take `pushOnValidationFailure`. They keep today's follow-on steps. On the default path those steps still run after a red loop, because the context succeeded.
- Changing the hand-written loop in the building-blocks doc. That sample already fails the context on its last red attempt on purpose.

## User stories / use cases

1. As a lump author using `retryUntilGreen`, I need a check that never passes to still push the branch, so I can open the failed work and see the check output.
2. As a lump author, I need `pushOnValidationFailure: false` when a red branch should not be published. The context stays `toDo` and later steps, including `folderSetTaskDoneStep`, do not run.
3. As a later step or hook in the same run, I need `lumpVariables.__VALIDATION_FAILED__` so I can tell a passed check from a loop that gave up.

## Proposed behavior and UX

`retryUntilGreen` gains `pushOnValidationFailure?: boolean`, default `true`, and passes it through to `getRecursiveSteps`. Same field and default on `GetRecursiveStepsOptions`.

The loop writes `lumpVariables.__VALIDATION_FAILED__` on the same object the engine passes into step hooks. Only `getRecursiveSteps` writes this key. Value is a boolean, not a string.

| End of loop | `__VALIDATION_FAILED__` | `pushOnValidationFailure` | Context |
| --- | --- | --- | --- |
| Check passed on any attempt | `false` | either | Success. Commit and push. No further iterations. |
| Last check still red | `true` | `true` (default) | Success. Commit and push. Steps after the loop still run. |
| Last check still red | `true` | `false` | `success: false`, reason `stepWalkFailed`. No commit, no push. Steps after the loop do not run. The flag is already `true`. |

Attempt schedule of `getRecursiveSteps({ maxIterations = 5, … })`, unchanged as a count:

| Attempt (`currentIteration`) | Steps run | Red check | Green check |
| --- | --- | --- | --- |
| `0` | `getFirstSteps` (the work steps) | Next iteration | Stop, `__VALIDATION_FAILED__ = false` |
| `1 … maxIterations - 1` | Fix steps | Next iteration | Stop, `__VALIDATION_FAILED__ = false` |
| `maxIterations` | Fix steps | Stop, `__VALIDATION_FAILED__ = true`, then the push rule above | Stop, `__VALIDATION_FAILED__ = false` |

- The user's check runs at most `maxIterations + 1` times (one first attempt, then up to `maxIterations` retries). This is the bound `continueOnError: currentIteration < maxIterations` already encodes for the retry decision. The last check is still the real `validationCommandFn`.
- The bound is the same at the top level and when the steps come back from a dynamic step function.
- `isValidationCommandResultOk` still decides red versus green. Default remains `commandSucceeded`.
- A green check on the last attempt does not set the flag to `true`.

Core pushes only after every context in the branch succeeds. `pushOnValidationFailure: false` fails that context's walk, which is what skips the push. The default does not fail the walk.

## Technical approach

| Step | File | Change |
| --- | --- | --- |
| 1 | `packages/recipes/src/kit/getRecursiveSteps.ts` | Cap on `currentIteration`, which each recursion already threads, not on `stepIndex` depth. Remove the `Loop limit reached` substitute. On a green check, set `__VALIDATION_FAILED__` to `false` and return no further steps. On a red check before the last attempt, return the next iteration. On a red last attempt, set `__VALIDATION_FAILED__` to `true`. Default: leave the walk successful. `pushOnValidationFailure: false`: fail the walk only after the flag is set. |
| 2 | `packages/recipes/src/kit/retryUntilGreen.ts` | Accept `pushOnValidationFailure` and pass it to `getRecursiveSteps`. |

Ownership: the retry cap, the flag write, and the push opt-out live only in `getRecursiveSteps`. `retryUntilGreen` forwards the option. `featureBacklog` and `abstractionBacklog` do not add a counter, a depth check, or a second flag write.

The last check has to finish and run its `postCommandExecFn` so the flag can be set before a withholding walk fails. Core does not call `postCommandExecFn` when `continueOnError` is false and the command exits non-zero, so the withholding failure is a later failed step, not `continueOnError: false` on the check itself.

## Testing strategy

| Level | Test | Covers |
| --- | --- | --- |
| Unit (recipes kit, real core walker) | New `packages/recipes/src/kit/getRecursiveSteps/unit.test.ts` (or next to `retryUntilGreen.ts`): `retryUntilGreen` through `executeStepsForContextList` on a temp git repo under `os.tmpdir()`, recording git stubs | Always-red check, default option, top level: `success: true`, commit and push recorded, `__VALIDATION_FAILED__ === true`, check ran `maxIterations + 1` times (default and an explicit `maxIterations`), no `echo` / `Loop limit reached` |
| Unit | Same file | Same always-red steps returned from a dynamic step function: same success, same flag, same check count |
| Unit | Same file | Always-red check with `pushOnValidationFailure: false`: `success: false`, reason `stepWalkFailed`, no commit or push, flag already `true`, a step appended after the loop did not run |
| Unit | Same file | Check green on attempt 0, and green on a middle attempt: `success: true`, commit and push, `__VALIDATION_FAILED__ === false`, no further check runs |
| Unit | Same file | Check green only on the last attempt: success, flag `false`, check count is `maxIterations + 1` |

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/cli/DOCS/author/prompts.md` | Validate-and-retry: a still-red last attempt pushes by default and sets `lumpVariables.__VALIDATION_FAILED__`. Mention `pushOnValidationFailure: false`. |
| `packages/apps/cli/DOCS/examples/building-blocks.md` | Retry-until-green intro: same default. Leave the hand-written sample as the explicit fail-on-last-red loop. |
| `packages/apps/cli/DOCS/author/recipes.md` | `retryUntilGreen` hits the cap by pushing unless `pushOnValidationFailure` is false, and sets `__VALIDATION_FAILED__`. `requireArtifactStep` still exits 1 when the file is missing. The loop, not that helper, decides whether the context fails. |

## Acceptance criteria

1. With an always-red check and the default option, `executeStepsForContextList` returns `success: true`, both git stubs run, and `lumpVariables.__VALIDATION_FAILED__` is `true`.
2. The real check runs exactly `maxIterations + 1` times in that case, both at the top level and nested in a dynamic step function. The `Loop limit reached` command is gone.
3. With `pushOnValidationFailure: false` and an always-red check, the result is `success: false` with reason `stepWalkFailed`, neither git stub runs, the flag is `true`, and steps placed after the loop do not run.
4. A check that passes on any attempt, including the last, sets `__VALIDATION_FAILED__` to `false`, ends the context with success, and does not run further checks.
5. `getRecursiveSteps.ts` no longer reads `stepIndex` depth to decide the cap. No other module writes `__VALIDATION_FAILED__` or adds a second retry cap.
6. `npm run test -w=@lumpcode/recipes` passes.
