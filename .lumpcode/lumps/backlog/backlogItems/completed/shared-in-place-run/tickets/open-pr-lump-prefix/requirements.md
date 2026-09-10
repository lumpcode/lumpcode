# Requirements: open-pr lump/ prefix

| Field | Value |
| --- | --- |
| **Backlog** | `open-pr-lump-prefix` · parent `shared-in-place-run` · priority **1** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary `@lumpcode/recipes` (`openPrPostTeardown`). CLI must not duplicate the check. |

Umbrella: [parent requirements](../../requirements.md).

## Problem statement and motivation

`openPrPostTeardown` opens a GitHub PR from `branchName` into `baseBranch` after push. Shared in-place `run` uses the authoring branch (`make-my-new-lump`, `dev`, …), not `lump/…`. Opening a PR from that branch would be wrong. The CLI never opens PRs itself; this helper is opt-in.

## Goals

1. Skip opening a PR unless `branchName` starts with `lump/`.
2. Dedicated `lump/<lumpName>/…` still opens when the helper is wired.
3. Skip remains log-only (never `workspaceTeardownFailed`).

## Non-goals

- Built-in open-PR in the CLI.
- Changing title, provider, or “PR already exists” skip rules except the prefix gate.
- Docs / website.
- Shared walk or review prompt.

## User stories / use cases

1. As an author — a lump with `openPrPostTeardown` run in shared on `make-my-new-lump` does not open a PR.
2. As an operator — dedicated still opens from `lump/myLump/button`.

## Proposed behavior and UX

At the start of the post-teardown helper, if `branchName` does not start with `lump/`, return without calling `gh`. Existing skips (head missing on origin, PR already exists) unchanged.

Prefix is the literal `lump/` used for dedicated campaign branches (`LUMP_BRANCH_PREFIX`).

## Technical approach

| Concern | Owner | Non-owners |
| --- | --- | --- |
| Prefix skip | `openPrPostTeardown` in `@lumpcode/recipes` | CLI command modules |

No CLI duplicate of the `lump/` check.

## Testing strategy

| Area | Where | Proves |
| --- | --- | --- |
| Recipes | existing `openPrPostTeardown` tests | skip `make-my-new-lump` / `dev`; still open `lump/myLump/button`; skip does not fail teardown |

## Acceptance criteria

1. `branchName` without `lump/` prefix → no `gh` / no PR.
2. Dedicated `lump/…` still opens when otherwise eligible.
3. CLI has no second prefix check.
