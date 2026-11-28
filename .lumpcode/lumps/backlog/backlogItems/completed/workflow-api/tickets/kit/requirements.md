# Requirements: Workflow kit and PR results

| Field | Value |
| --- | --- |
| **Backlog** | `workflow-api` / `kit` · priority **14** · type **feature** (breaking) |
| **Status** | Pending implementation |
| **Depends on** | `config-and-plan` |
| **Contract** | `../../requirements.md` (Recipes and kit) |
| **Packages** | `@lumpcode/recipes` (`src/kit/`, `src/kit/openPrPostTeardown/`). `@lumpcode/core` and the CLI unchanged. |

## Problem statement and motivation

The kit is built from steps: `retryUntilGreen` wraps `getValidationLoopSteps`, which recurses through `postCommandExecFn` and withholds a push with a fake `exit 1` step. A workflow author needs the same jobs as plain async functions, and `openPrPostTeardown` should report what the workflow said.

## Goals

1. `retryUntilGreen`, `requireArtifact`, `mustSucceed` as workflow helpers, with the plain names.
2. Today's `retryUntilGreen` is `retryUntilGreenSteps`.
3. PRs carry the contexts' messages and open as drafts when a context did not succeed.

## Non-goals

- Recipes (`recipes`). Workflow `setTaskDone` (`recipes`). Other PR hosts (`factory-templates-open-pr-providers`).
- Deprecation aliases: the rename is breaking by decision.

## Proposed behavior

### `retryUntilGreen` (workflow)

Signature in the umbrella contract.

1. If `prompt`, `session.prompt(prompt)`.
2. Run `shell(check)`. Green: return `{ succeeded: true, attempts, lastCheck }`.
3. Red and `attempts < maxAttempts`: `session.prompt(fixPrompt(lastCheck, attempt))`, default text identical to today's `defaultFixPrompt` ("The verification step failed…", the command, the output); back to 2.
4. Out of attempts: `{ succeeded: false, … }`. Never throws for a red check; an abort propagates.

Labels: `retry: <check>` for checks, `retry fix <attempt>/<max>` for fix prompts.

### `requireArtifact`

Prompts until `path.join(workspacePath, path)` exists, up to `maxAttempts`; returns `{ succeeded, path }`.

### `mustSucceed`

Returns the result when `succeeded`; otherwise throws `Error(message ?? '<label> failed', { cause: result })`, where the message ends with the last 2,000 characters of the output.

### Rename

`retryUntilGreen` (steps) → `retryUntilGreenSteps`, same signature. The changelog entry: `retryUntilGreen now takes { session, shell, check }; the steps version is retryUntilGreenSteps.`

### `openPrPostTeardown`

| Input | PR |
| --- | --- |
| No pushed context has a `message` | body `LUMP contexts: <names>` (today) |
| Some do | body: `### <context name>\n<message>` per pushed context with a message, joined by blank lines |
| Any pushed context `succeeded: false` and `draftOnFailure` (default `true`) | draft (`gh pr create --draft`) |
| `title` / `body` options | override; their input includes `contextResults` |

## Technical approach

| Step | Files | Change |
| --- | --- | --- |
| 1 | `src/kit/retryUntilGreen.ts` → rename the export to `retryUntilGreenSteps` (file `retryUntilGreenSteps.ts`) | Steps version |
| 2 | new `src/kit/workflow/retryUntilGreen.ts`, `requireArtifact.ts`, `mustSucceed.ts` | Workflow helpers; the default fix prompt text shared with the steps version from one module |
| 3 | `src/kit/index.ts` | Exports; no alias |
| 4 | `src/kit/openPrPostTeardown/main.ts`, `github.ts` | Body from `contextResults`, `draftOnFailure`, `draft` flag |
| 5 | callers of `retryUntilGreen` in `src/recipes/` | Move to `retryUntilGreenSteps` (the recipes themselves change in `recipes`) |
| 6 | this repo's lumps that import `retryUntilGreen` (`.lumpcode/lumps/*/config.ts`: `autoTriage`, `polisher`, and any other `grep -l retryUntilGreen` hit) | Import `retryUntilGreenSteps`; `lump-plan` output unchanged |

## Testing strategy

| Level | Test | Covers |
| --- | --- | --- |
| Unit | `kit/workflow/*.unit.test.ts` with fake `AgentSession` and `Shell` | Green first try; green after fixes; out of attempts; fix prompt text; abort propagates; `requireArtifact` with a real temp dir; `mustSucceed` message |
| Unit | `retryUntilGreenSteps` | Today's `retryUntilGreen` tests, renamed |
| Unit | `openPrPostTeardown/unit.test.ts` | Each table row; `--draft` in the `gh` argv |
| Type | kit types test | `retryUntilGreen({ steps: … })` is a type error; `retryUntilGreenSteps({ steps: … })` type-checks |
| Repo | `lump-plan` for every lump in `.lumpcode/lumps/` | Valid after the import rename |

## Docs updates

`DOCS/author/recipes.md` kit section: the workflow helpers first, then "Steps kit" with the `…Steps` names. `CHANGELOG`: the breaking rename.

## Acceptance criteria

1. The umbrella example's `retryUntilGreen` call works as written.
2. Today's steps usage works after renaming the import to `retryUntilGreenSteps`, with identical steps.
3. A workflow returning `{ succeeded: false, message }` gets a draft PR with the message in the body.
