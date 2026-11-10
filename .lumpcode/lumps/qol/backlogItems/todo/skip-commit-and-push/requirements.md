# Requirements: Skip commit and push

| Field | Value |
| --- | --- |
| **Backlog** | `skip-commit-and-push` · priority **0** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | `@lumpcode/cli` only. `@lumpcode/core`, `@lumpcode/recipes`, and `@lumpcode/cli-utils` stay unchanged. |

## Problem statement and motivation

A dedicated run always commits a `LUMP:` marker and pushes `lump/<lumpName>/…`. `jsConfigToRunLumpInput` installs that pair itself. `LumpJsConfig` omits `gitAddCommitFn` and `gitPushFn`, so a lump cannot turn them off.

Some lumps need the branch workspace and the steps, and must not publish `lump/…`.

1. Dedicated mode spreads `makeGatedGitFns` whenever a git lock is present. Those functions commit and push, then return `success(undefined)` so core does not run git a second time.
2. With no git lock, the CLI omits both functions and core's defaults commit and push.
3. Shared mode already injects a no-op pair. That path is the laptop, not a worker.

## Goals

1. Optional `skipCommitAndPush` on the lump config. Omit and `false` keep today's dedicated commit and push.
2. `true` on a dedicated run injects the same no-op pair shared mode already uses, for both add+commit and push, with or without a git lock.
3. The run still builds the branch workspace, runs each context's steps there, and tears the workspace down.
4. Context status stays marker-based. This field does not finish a context.

## Non-goals

- A lump that opens `feature/*` branches, and any `featureBacklog` discovery change.
- Per-context or per-run switching. The field is lump-wide.
- `project.json` / `local.json` overlay. Not a shared default like `writeTranscripts`.
- Changing `branchFn`, workspace setup, or workspace teardown.
- Changing core's git function types, or teaching core a new publish target.
- Blocking `git push` inside a step. The field only replaces the CLI's injected pair.
- The shared-mode review prompt (`c` commit / `e` leave dirty). Shared already does not auto-commit or push.
- `openPrPostTeardown`. It already skips when the lump head is missing on origin.
- Context status, `maximumNumberOfConcurrentBranches`, or `clean`. No remote `lump/…` ref is created, so the open-branch cap does not count the run. A context that stays in the list runs again next tick.

## User stories / use cases

1. As a lump author — I set `skipCommitAndPush: true` so a worker runs the steps in the branch workspace and leaves origin without a `lump/…` branch.
2. As a lump author — I omit the field and a dedicated run still commits the marker and pushes `lump/…`.
3. As an operator on a laptop — shared mode is unchanged: no automatic commit or push, and the `c` / `e` prompt still appears.

## Proposed behavior and UX

Lump-only boolean on `LumpJsConfig` and on `lumpConfig.schema.json`. `defineConfig` picks it up from `LumpJsConfig`.

| Value | Dedicated `gitAddCommitFn` / `gitPushFn` |
| --- | --- |
| omit / `false` | Git lock present: `makeGatedGitFns` (today). Git lock absent: both functions omitted, so core's defaults run (today). |
| `true` | The shared no-op pair: each returns `success(undefined)` and runs no git. Same when a git lock is present. |

Shared mode keeps the no-op pair whether the field is set or not.

The no-op pair does not take the git-common-dir lock. Workspace setup and teardown still do. `gitCommitMessageFn` stays installed. Core may still ask for the message. The no-op commit ignores it.

`skipCommitAndPush` is not a field of `RunLumpInput`. Strip it before `...rest` is copied onto the engine input, the same way `verbose` is stripped.

JSON schema: optional boolean. A non-boolean fails `validateLumpJsonConfig`. Omit stays valid.

Operator docs say: the worker still cuts the local `lump/…` workspace and runs the steps. It does not commit and does not push. The next dedicated setup deletes that local branch and recreates it from `origin/<base>`. Anything that must survive has to be done by a step.

## Technical approach

Owner of the choice: `jsConfigToRunLumpInput` in `packages/apps/cli/src/utils/jsConfigToRunLumpInput/main.ts`. It already owns `makeSharedNoopGitFns` and the spread of `makeGatedGitFns`. Callers (`run`, daemon tick) must not grow a second switch.

| Step | Where | What |
| --- | --- | --- |
| 1 | `LumpJsConfig` | Optional `skipCommitAndPush?: boolean`. |
| 2 | `jsConfigToRunLumpInput` | Destructure the field out of `rest`. `true` selects `makeSharedNoopGitFns` for dedicated as well as shared, including when `gitLock` is set. Omit / `false` keeps the current branch of that choice. |
| 3 | `lumpConfig.schema.json` | Optional boolean. Description matches the table above. |
| 4 | Docs listed below | Field and the dedicated-run exception. |

`makeGatedGitFns` stays the publishing implementation. Do not add a skip branch inside it.

## Testing strategy

| Level | Where | Proves |
| --- | --- | --- |
| Unit | `jsConfigToRunLumpInput/testing/general.unit.test.ts` | Dedicated + git lock + `true`: both functions return `success(undefined)` and do not commit. Dedicated + git lock + omit: still the gated pair (existing test). Dedicated + no git lock + `true`: the no-op pair is present (today the functions are omitted). `false` matches omit. The key is absent on `RunLumpInput`. Shared + `true` stays a no-op. |
| Unit | `validateLumpJsonConfig/unit.test.ts` | `true` and `false` validate. A non-boolean fails. Omit still validates. |

No E2E. `makeGatedGitFns` tests stay as they are.

## Docs updates

Canonical behavior lives on the run page. The lump field table points at it. Other pages get one clause, not a second explanation.

| Document | Change |
| --- | --- |
| `packages/apps/cli/DOCS/config/lump.md` | Row in the optional-fields table. `true` skips the worker commit and push. Link to the run page. |
| `packages/apps/cli/DOCS/start/run.md` | Step 6: a lump with `skipCommitAndPush: true` still runs the steps in the branch workspace and does not commit or push. |
| `packages/apps/cli/DOCS/start/terms.md` | Dedicated-mode cell: that field skips the commit and the push. |
| `packages/apps/cli/DOCS/reference/commands.md` | `lumpcode run`: dedicated still commits and pushes unless the lump sets the field. |

The website renders these pages from `packages/apps/cli/DOCS/`. No separate website copy.

## Acceptance criteria

1. A dedicated run whose lump sets `skipCommitAndPush: true` runs the steps in the branch workspace, writes no `LUMP:` commit, and does not push `lump/…`, with or without a git lock.
2. Omit and `false` on a dedicated run still commit and push as today, including the no-lock path that uses core's default git functions.
3. Shared mode still skips automatic commit and push, and still offers `c` / `e`, whether or not the field is set.
4. `RunLumpInput` does not receive `skipCommitAndPush`. `makeGatedGitFns` has no skip branch.
5. A JSON lump config accepts a boolean and rejects a non-boolean. `project.json` and `local.json` do not grow the field.
6. The four docs pages above describe the field. No second copy of the lifecycle outside `DOCS/start/run.md`.
