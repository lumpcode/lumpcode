# Learnings

## Expected

`desc.yml` asks `runLump` to stop returning `result.contextRunStateList` as `[]` after contexts run. `requirements.md` puts the fix in `executeStepsForContextList`: after `setupFn` resolves each context's `contextRunState`, store that same object on the returned list at the context's index. A successful run then has one entry per `contextNames` entry, in the same order, including later mutations. `{}` when `setupFn` returns nothing. `runLump` only forwards that result. The no-todo success (`contextRunStateList: []`) and failure results stay as they are. `branchFn` still runs before any `setupFn`, so the list it receives is empty. No `testPlan.md` or `expect.yml` on this item.

## Landed

Working tree, no marker commit yet.

- `packages/core/src/helpers/executeStepsForContextList/main.ts` — assigns `contextRunStateList[i]` to the live `contextRunState` right after `setupFn`.
- `packages/core/src/helpers/executeStepsForContextList/testing/general.unit.test.ts` — two contexts: seed plus mutations from `StepFn`, `promptFn`, `commandFn`, `postCommandExecFn`, and `teardownFn`, same order as `contextNames`, same object identities; a `setupFn` that returns nothing yields `{}`. `branchFn` still sees length 0.
- `packages/core/src/usages/runLump/unit.test.ts` — success forwards that non-empty list; the no-todo result is still the empty list.
