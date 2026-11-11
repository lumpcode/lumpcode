# Requirements: `lump-plan --plan` applies the open-branch cap on a shared checkout

| Field | Value |
| --- | --- |
| **Backlog** | `lump-plan-shared-branch-cap` · priority **20** · type **fix** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary `@lumpcode/cli` (`utils/planLumpFromJsConfig`, `utils/runLumpFromJsConfig/evaluateTooManyOpenBranchesSkip`). `@lumpcode/core`, `@lumpcode/recipes`, and docs unchanged. |

## Problem statement and motivation

[Commands](../../../../../../packages/apps/cli/DOCS/reference/commands.md) says `run` succeeds with a skip when there are "too many open `lump/<name>/*` branches on a dedicated worker", and that `lump-plan` is the preview: `--plan` is the "Dry-run of branch, git strings, batch" and `--todoOnly` shows "only what `run` would pick next".

`runLumpFromJsConfig` calls `evaluateTooManyOpenBranchesSkip` only when `localConfig.mode !== 'shared'`. [`packages/apps/cli/src/utils/planLumpFromJsConfig/main.ts`](../../../../../../packages/apps/cli/src/utils/planLumpFromJsConfig/main.ts) has its own copy of the cap check at `depth === 'plan'` and applies it in every mode.

1. On a laptop (`mode: "shared"`), `lump-plan --plan` says the run will be skipped, then `run` runs a context.
2. The preview hides the batch, branch, and workspace strings the operator asked for.
3. The cap rule lives in two places, so they have already drifted.

### Repro (run during bug hunt, built CLI, temp repo, `local.json` `{"mode":"shared"}`)

Lump `demo`, `config.json`:

```json
{
  "command": "fake",
  "maximumNumberOfConcurrentBranches": 1,
  "contextListJson": { "SRC": "src/{NAME}/index.ts", "TEST": "src/{NAME}/index.test.ts" },
  "prompt": { "promptTemplate": "Do @{SRC} and @{TEST}" }
}
```

`src/a/` and `src/b/` each hold both files. `origin` has one unmerged branch `lump/demo/a` carrying `LUMP: demo - a`. `fake` is a project command module that appends the prompt to `agent-out.txt`.

```text
$ lumpcode lump-plan demo --plan --todoOnly
todoOnly filter: b
…
plan: skipped (tooManyOpenBranches)
  Lump "demo" has 1 open branch(es), which meets or exceeds maximumNumberOfConcurrentBranches (1).
$ lumpcode run demo
[lumpcode] Running context "b"
SUCCESS: Lump run successfully
$ cat agent-out.txt
Do @src/b/index.ts and @src/b/index.test.ts
```

| | Result |
| --- | --- |
| **Actual** | `lump-plan --plan` reports a `tooManyOpenBranches` skip; `run` runs `b`. |
| **Expected** | `lump-plan --plan` shows the plan for `b` (branch, workspace, batch), as `run` does. |

## Goals

1. `lump-plan --plan` reports `plan.skipped.reason: 'tooManyOpenBranches'` exactly when `run` would skip for that reason with the same config and mode.
2. One owner decides whether the open-branch cap applies; `run` and `lump-plan` both call it.

## Non-goals

- Changing whether `run` applies the cap in shared mode. It still does not.
- Changing how open branches are counted (`countOpenLumpBranches`).
- Changing `disabled` handling or the `--contexts` / `--prompts` depths.
- Changing the skip message wording or the `plan.skipped` shape.

## User stories / use cases

1. As an operator on a laptop with `maximumNumberOfConcurrentBranches` set for the worker, I run `lump-plan --plan` and see the batch `run` will pick here.
2. As an operator on a dedicated worker, I still see the `tooManyOpenBranches` skip in the plan when `run` would skip.

## Proposed behavior and UX

No new flags or output fields. `PlanLumpOutput.plan.skipped` keeps its shape and is set only on a dedicated checkout when the cap is reached.

The gate's contract, owned by `evaluateTooManyOpenBranchesSkip`:

| Input | Meaning |
| --- | --- |
| `jsConfig`, `lumpName`, `executionWorkspacePath` | As today |
| `mode` | `local.json` mode. `shared` returns `null` (no skip) without counting branches |

Returns the existing `TooManyOpenBranchesSkip` or `null`.

## Technical approach

| Step | File | Change |
| --- | --- | --- |
| 1 | `packages/apps/cli/src/utils/runLumpFromJsConfig/evaluateTooManyOpenBranchesSkip.ts` | Takes `mode`; returns `null` for `shared`. |
| 2 | `packages/apps/cli/src/utils/runLumpFromJsConfig/main.ts` | Calls the gate with `localConfig.mode` instead of wrapping it in its own mode check. |
| 3 | `packages/apps/cli/src/utils/planLumpFromJsConfig/main.ts` | Replaces its inline cap check with a call to the gate, passing the resolved mode, and maps the result onto `plan.skipped`. |

Owner: `evaluateTooManyOpenBranchesSkip`. `planLumpFromJsConfig` and `runLumpFromJsConfig` must not compare the open-branch count to `maximumNumberOfConcurrentBranches` themselves.

## Testing strategy

| Level | Test | Covers |
| --- | --- | --- |
| Unit | `packages/apps/cli/src/utils/planLumpFromJsConfig/unit.test.ts`: shared `local.json`, cap 1, one open lump branch on origin | `plan.skipped` is undefined; `plan.contextNames` and `plan.branchName` are set. |
| Unit | same file: existing dedicated cap cases | Pass unchanged. |
| Unit | `packages/apps/cli/src/utils/runLumpFromJsConfig/unit.test.ts`: existing cap and shared-mode cases | Pass unchanged. |

## Acceptance criteria

1. The repro's `lump-plan --plan --todoOnly` prints a plan for `b`, not a skip.
2. On a dedicated checkout with the cap reached, `lump-plan --plan` still reports `tooManyOpenBranches`.
3. Only `evaluateTooManyOpenBranchesSkip` compares the open-branch count to `maximumNumberOfConcurrentBranches`.
4. `npm run test -w=@lumpcode/cli` is green.
