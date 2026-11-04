# Requirements: `clean --contextName` deletes other lumps' branches

| Field | Value |
| --- | --- |
| **Backlog** | `clean-context-deletes-other-lump-branches` · priority **20** · type **fix** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary `@lumpcode/cli` (`clean` command). `@lumpcode/core` and `@lumpcode/recipes` unchanged. |

## Problem statement and motivation

`lumpcode clean --lumpName <L> --contextName <X>` is documented as scoped ("Scope cleanup to a single context (requires lumpName)"; [commands reference](../../../../../../packages/apps/cli/DOCS/reference/commands.md) `clean`). The owning function, `discoverByContext` in [`packages/apps/cli/src/commands/clean/main.ts`](../../../../../../packages/apps/cli/src/commands/clean/main.ts), finds the commits carrying X's `LUMP: <L> - <X>` marker, then collects **every** branch that contains any of those commits via `git branch [-r] --contains`, keeping anything that starts with `lump/`. It then runs `git push --delete origin …` and `git branch -D …` on that set.

1. The filter is `lump/`, not `lump/<L>/`. Branches of other lumps are candidates.
2. `--contains` follows ancestry. After X's pull request merges into the base, every lump branch cut from the base afterwards contains X's marker commit. They are all deleted, on the remote too.
3. The result is silent: the command reports `Cleaned N branch(es)` and lists the unrelated branches in `deletedBranches`.

### Repro (run during bug hunt, scratch test against a real bare remote via `initBareRemoteAndCheckout`)

1. `local.json`: `{ "mode": "dedicated", "primaryBranch": "main" }`.
2. Create `lump/myLump/button` from `main` with commit `LUMP: myLump - button`, merge it into `main` (`--no-ff`), push `main`.
3. Create `lump/otherLump/card` from the new `main` with commit `LUMP: otherLump - card`, push it.
4. Run the `clean` handler with `{ lumpName: 'myLump', contextName: 'button' }`.

| | Result |
| --- | --- |
| **Actual** | `deletedBranches: ['lump/otherLump/card', 'lump/myLump/button']`; `git ls-remote --heads origin` shows only `main`. The unmerged `otherLump` branch is gone from the remote. |
| **Expected** | `lump/otherLump/card` is untouched. Only `lump/myLump/*` branches that carry the `button` marker on their own, unmerged commits are deleted. |

The same ancestry leak also hits other contexts of the same lump (`lump/myLump/form` cut from `main` after `button` merged).

## Goals

1. `clean --lumpName <L> --contextName <X>` never deletes a branch outside `lump/<L>/`.
2. It never deletes a branch that only inherits X's marker through the base it was cut from.
3. Existing behavior for unmerged X branches is kept: single-context `lump/<L>/<X>`, batch (hashed) branches carrying X's marker, marker in the commit body, local-only branches.

## Non-goals

- Changing `clean` without `--contextName` (glob `lump/<L>/*` or `lump/*`).
- Reporting `git push --delete` failures, or adding `--prune` to the fetch.
- Changing marker format or `commitMessageIncludesMarker`.

## User stories / use cases

1. As an operator, I clean the branches of one context I want to redo, so other lumps' and other contexts' open pull request branches survive.
2. As an operator on a worker with several lumps, I can run `clean --contextName` after a merge without losing unmerged work on the remote.

## Proposed behavior and UX

CLI syntax and output envelope are unchanged: `{ messages: ['Cleaned N branch(es)'], data: { deletedBranches: string[] } }`.

A branch `B` (local `lump/…` or remote `origin/lump/…`) is deleted by `clean --lumpName L --contextName X` only when both hold:

| Rule | Contract |
| --- | --- |
| Scope | `B`'s short name starts with `lump/<L>/`. |
| Own marker | Some commit reachable from `B` but **not** reachable from any remote-tracking head outside `lump/` (for example `origin/main`, `origin/dev`) has a message for which `commitMessageIncludesMarker(message, 'LUMP: <L> - <X>')` is true. |

When X is already merged into a non-lump head, its marker is no longer "own" for any branch, so a merged context deletes nothing through `--contextName`. Operators use `clean --lumpName L` for stale merged branches.

## Technical approach

| Step | File | Change |
| --- | --- | --- |
| 1 | `packages/apps/cli/src/commands/clean/main.ts` | `discoverByContext` restricts candidates to `lump/<L>/` (reuse `lumpBranchGlob({ lumpName })` for the prefix) and decides "own marker" per the rule above, excluding commits reachable from non-`lump/` remote-tracking heads. |

`discoverByContext` is the only owner of context-scoped branch selection. Do not move this logic into `deleteRefs` or a shared util.

## Testing strategy

| Level | Test | Covers |
| --- | --- | --- |
| Unit (real git fixture) | `packages/apps/cli/src/commands/clean/unit.test.ts`: merged `lump/myLump/button` into `main`, then `lump/otherLump/card` cut from `main` | Other lump's branch survives on remote and locally (the repro above). |
| Unit | same file: `lump/myLump/form` cut from `main` after `button` merged | Same-lump sibling survives. |
| Unit | existing `contextName scopes cleanup to a single context` and `contextName finds a marker in the commit body` | Still pass unchanged. |

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/cli/DOCS/reference/commands.md` (`clean`) | `--contextName` deletes `lump/<lumpName>/*` branches whose unmerged commits carry that marker. |

## Acceptance criteria

1. In the repro, `lump/otherLump/card` stays in `git ls-remote --heads origin` and is absent from `deletedBranches`.
2. A same-lump branch cut from the base after the merge is not deleted.
3. Existing `clean` unit tests pass without changes to their assertions.
4. `npm run test -w=@lumpcode/cli` is green.
