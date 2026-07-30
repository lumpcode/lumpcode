# Requirements: Execute steps teardown on failure

| Field | Value |
| --- | --- |
| **Backlog** | `execute-steps-teardown-on-failure` · priority **2** · type **fix** |
| **Status** | Pending implementation |
| **Depends on** | `kill-spawned-command-on-timeout-abort` |
| **Packages** | Primary: `packages/core` (`executeStepsForContextList`, `runLump` failure typing). Minor: `packages/apps/cli` (`runLumpFromJsConfig` warn). Recipes unchanged. |

## Problem statement and motivation

When the step walk sets a failure (command fail without `continueOnError`, or abort), `executeStepsForContextList` returns immediately and skips per-context `teardownFn` and `teardownWorkspaceFn`. Agent kill on timeout/abort is separate; this item is workspace/hook cleanup.

Concrete pain:

1. Failed or aborted runs leave checkout/worktree state unclean (no `teardownWorkspaceFn`).
2. Custom / command-module `teardownFn` hooks never run on that path.
3. Operators cannot tell a post-success workspace-teardown failure from a mid-walk failure (both are plain `{ message }`).

## Goals

1. After successful workspace setup, always run `teardownWorkspaceFn` on any exit (step-walk failure, git add failure, throw, success).
2. After each context’s walk attempt, always run `teardownFn`; on `stepWalkFailure` skip git add/commit for that context, remaining contexts, and push.
3. Soft-fail `teardownFn` errors (log, never block git, never become the returned failure).
4. On workspace-teardown command failure with no earlier run failure, return `Failure` with `reason: 'workspaceTeardownFailed'`; if a step-walk failure was already recorded, keep that as the returned failure.
5. Stamp `reason: 'stepWalkFailed'` on returned step-walk failures; CLI warns when the returned reason is `workspaceTeardownFailed` that commit/push usually already succeeded.
6. Document the behavior in `AGENTS.md` and a short CLI `concepts.md` note.

## Non-goals

- Stopping the daemon when workspace teardown fails (ticks already re-preflight / hard-reset the execution workspace).
- Structured `reason` values beyond `'stepWalkFailed' | 'workspaceTeardownFailed'`.
- Changing `TeardownFn` / `TeardownWorkspaceFn` signatures or CLI workspace fn generation.
- Changing git push’s “log error, do not return Failure” behavior.
- E2E coverage for this item.

## User stories / use cases

1. **Operator (failed step)** — A command fails mid-lump. Per-context teardown and workspace teardown still run; the run returns the step failure; no push for that failed batch.
2. **Operator (abort)** — Ctrl+C / daemon abort stops the walk; teardowns still run; returned failure has `reason: 'stepWalkFailed'`.
3. **Operator (teardown after success)** — Walk and push succeed but `git switch` / worktree teardown fails. Run returns Failure with `reason: 'workspaceTeardownFailed'`; CLI warns that work was usually already committed/pushed; next preflight should reset the workspace.
4. **Author (custom teardownFn)** — Lump `teardownFn` throws. Error is logged; git add/commit/push still proceed on the success path.
5. **Maintainer** — Unit tests prove teardowns on failure/abort, soft `teardownFn`, multi-context, reasons, and the CLI warn.

## Proposed behavior and UX

### Control flow (`executeStepsForContextList`)

| Phase | On success | On `stepWalkFailure` (incl. abort) |
| --- | --- | --- |
| Per context after walk | `teardownFn` then git add/commit | `teardownFn` in `finally`; skip git; stop further contexts |
| After context loop | git push (push fail: log only, as today) | skip push |
| After successful `setupWorkspace` | `teardownWorkspaceFn` in outer `finally` | same |

Preserve success order: walk → `teardownFn` → git → (other contexts) → push → workspace teardown. Workspace teardown must never run before git add/push on the success path.

`teardownWorkspaceFn` also runs on other post-setup exits (e.g. git add failure, unexpected throw), not only `stepWalkFailure`.

### `teardownFn` errors

Catch, log (`logger.error`), continue. Never block git add/commit/push. Never become the returned `Failure`.

### Failure precedence (returned Result)

| Situation | Returned failure |
| --- | --- |
| Step walk failed (and optional later teardown errors) | Step-walk failure (`reason: 'stepWalkFailed'`); log teardown problems |
| Walk/git finished; workspace teardown command fails | `reason: 'workspaceTeardownFailed'` |
| Only soft `teardownFn` error on success path | No failure from teardown; continue |

### Core failure contract

```ts
type ExecuteStepsFailureReason =
  | 'stepWalkFailed'
  | 'workspaceTeardownFailed';

type ExecuteStepsFailureData = {
  message: string;
  reason?: ExecuteStepsFailureReason;
};

// executeStepsForContextList and runLump Failure data
Failure<ExecuteStepsFailureData>
```

| Path | `reason` |
| --- | --- |
| Returned step-walk failure (command fail / abort) | `'stepWalkFailed'` |
| Returned workspace-teardown command failure | `'workspaceTeardownFailed'` |
| Workspace setup fail, git add fail, etc. | omit (`message` only) |

`runLump` may rewrite `data.message` (existing prefix); it must preserve `data.reason` when present.

### CLI (`runLumpFromJsConfig`)

When `!runLumpResult.success` and `runLumpResult.data.reason === 'workspaceTeardownFailed'`:

- `logger.warn` that workspace teardown failed after the lump finished; git commit/push usually already succeeded; next preflight should reset the execution workspace.
- Still `return failure(toRunLumpMessageFailure(message))` (no new CLI failure `kind`).

No warn when the returned reason is `'stepWalkFailed'` (push was skipped).

## Technical approach

| Step | Where | Contract / change |
| --- | --- | --- |
| 1 | `packages/core` types (near execute-steps or shared failure types) | Export `ExecuteStepsFailureReason` / `ExecuteStepsFailureData` (or equivalent names) |
| 2 | `executeStepsForContextList/main.ts` | Outer `try/finally` after successful setup for workspace teardown; per-context `try/finally` for `teardownFn`; stamp reasons; soft-catch `teardownFn`; apply precedence |
| 3 | `runLump/main.ts` | Failure type includes optional `reason`; preserve `reason` when rewriting `message` |
| 4 | `runLumpFromJsConfig/main.ts` | Warn on `workspaceTeardownFailed`; return message failure as today |
| 5 | Docs | `AGENTS.md` engine bullet; short CLI `DOCS/concepts.md` note |

## Testing strategy

### Unit (core)

| Case | Expect |
| --- | --- |
| Command `stepWalkFailure` | `teardownFn` + `teardownWorkspaceFn` ran; no git add/push; `reason: 'stepWalkFailed'` |
| Abort | Same as above |
| Success + failing teardown command | Push was attempted; `reason: 'workspaceTeardownFailed'` |
| `teardownFn` throws on success | Logged; git still runs |
| Multi-context: first OK, second walk fails | First context teardown+git done; second teardown runs; no push; `stepWalkFailed` |

Update existing `executeStepsForContextList` / timeout-abort tests if they assume early return without teardown.

### Unit (CLI)

| Case | Expect |
| --- | --- |
| `runLump` fails with `reason: 'workspaceTeardownFailed'` | Warn logged; still `Failure` with `kind: 'message'` |
| `reason: 'stepWalkFailed'` | No “already pushed” warn |

### E2E

None for this item.

## Docs updates

| Document | Change |
| --- | --- |
| `AGENTS.md` | Engine: teardowns always after successful workspace setup; soft `teardownFn`; workspace teardown failure reason; push still after per-context git |
| `packages/apps/cli/DOCS/concepts.md` | Short note: failed runs still tear down the branch workspace; if teardown itself fails, commit/push usually already happened; next preflight resets |

## Acceptance criteria

1. Step-walk failure or abort still runs current-context `teardownFn` and `teardownWorkspaceFn`, skips push for that failed batch, returns `reason: 'stepWalkFailed'`.
2. After successful setup, git add failure (and similar post-setup exits) still run `teardownWorkspaceFn`.
3. Success path order remains walk → `teardownFn` → git → push → workspace teardown.
4. `teardownFn` throw never blocks git and never replaces the Result.
5. Lone workspace-teardown command failure returns `reason: 'workspaceTeardownFailed'`; CLI emits the warn; CLI failure kind stays `message`.
6. When step-walk already failed, a subsequent teardown failure does not change the returned reason from `stepWalkFailed`.
7. Multi-context unit test passes as specified.
8. `AGENTS.md` and `concepts.md` updated; no daemon-stop behavior added.
