# Requirements: tickets wait for their parent's `dependsOn`

| Field | Value |
| --- | --- |
| **Backlog** | `child-tickets-inherit-parent-depends-on` · priority **10** · type **fix** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary `@lumpcode/recipes` (`recipes/featureBacklog`). `@lumpcode/core`, the generic `backlog` recipe, and the `folderBacklogContexts` kit unchanged. Docs in `packages/apps/cli/DOCS/author/recipes.md`. |

## Problem statement and motivation

An operator split a feature into an umbrella parent with two tickets:

```text
todo/
  persistence/desc.yml              # dependsOn: []
  auth/desc.yml                     # dependsOn: [persistence]
  auth/tickets/sessions/desc.yml    # dependsOn: []
  auth/tickets/login/desc.yml       # dependsOn: [sessions]
```

They expected nothing under `auth` to start before `persistence` was merged. Instead, `auth-sessions` ran, its branch was pushed and merged before `persistence`, and its agent rebuilt the persistence code it needed. The two branches then diverged on the same files.

Cause, from the code:

1. `featureBacklog` `parseItem` (`packages/recipes/src/recipes/featureBacklog/main.ts`) sets a ticket's `dependsOn` to its own entries rewritten as `${parentName}-${dep}`. A ticket can therefore only depend on siblings, and it never sees the parent's `dependsOn`.
2. The parent's `dependsOn` reaches only the parent's own `completion` context, which also waits for every ticket. It gates when the parent finishes, not when its tickets start.
3. Writing the parent's dependency into a ticket's `desc.yml` does not work around it. `dependsOn: [persistence]` on `sessions` becomes `auth-persistence`, a context that never exists, so the ticket waits forever.

`lumpcode lump-plan <lump> --contexts` shows it: `auth-sessions` has no `dependsOnContexts`, and `auth-login_testImpl` lists only `auth-sessions`.

## Goals

1. Every context of a ticket (any stage: `req`, `testPlan`, `testImpl`, `impl`, `directImpl`) waits for its parent's `dependsOn` as written in the parent's `desc.yml`, in addition to its own sibling dependencies.
2. The parent's `completion` context keeps its current dependencies: the parent's `dependsOn` plus every ticket.
3. `lump-plan --contexts` and `run` show and apply the same dependencies, because both read the recipe's context list.

## Non-goals

- Letting a ticket name a non-sibling item directly in its own `dependsOn`. Its entries stay sibling names.
- Changing the generic `backlog` recipe, `abstractionBacklog`, or the `folderBacklogContexts` kit.
- Changing how dependency status is computed (merged marker on the discovery branch).
- Nested parents deeper than `todo/<parent>/tickets/<ticket>`, which the recipe does not support today.

## User stories / use cases

1. As an operator — I put `dependsOn: [persistence]` on an umbrella parent, so none of its tickets starts until `persistence` is merged into the branch the tickets run on.
2. As an operator — I read `lump-plan --contexts` for a ticket and see both its sibling dependencies and the ones it inherits from its parent.

## Proposed behavior and UX

For a ticket in `todo/<parent>/tickets/<ticket>/`, its contexts' `dependsOnContexts` are the union of:

- the ticket's own `dependsOn` entries, rewritten to `${parent}-${dep}` as today, and
- the parent's `dependsOn` entries, unchanged (item names at the parent's level),

with duplicates removed. Order is not significant. A parent without `dependsOn`, or with `dependsOn: []`, changes nothing for its tickets.

Example, with the layout above:

| Context | `dependsOnContexts` |
| --- | --- |
| `auth-sessions_testImpl`, `auth-sessions` | `persistence` |
| `auth-login_testImpl`, `auth-login` | `auth-sessions`, `persistence` |
| `auth` (`completion`) | `persistence`, `auth-sessions`, `auth-login` (unchanged) |

The parent's `desc.yml` is read from `todo/<parent>/desc.yml` and validated the same way as any other item. A ticket in `todo/` always has its parent in `todo/`, because the recipe moves a parent to `completed/` only after every ticket is done.

## Technical approach

- **Owner:** `resolveFeatureBacklogItem` in `recipes/featureBacklog`. For a ticket (`item.parentName` set), it returns the parent's `dependsOn` in `additionalDependsOnContexts`, which `backlog` already merges with `item.dependsOn` into `dependsOnContexts`. `parseItem` keeps rewriting the ticket's own entries to sibling names.
- Read the parent's `desc.yml` with the same YAML load and `validateBaseBacklogItem` check the kit uses. Read it once per parent per context-list build, not once per ticket stage.
- Deduplicate the merged list, so an inherited entry that is also reachable another way appears once.

## Testing strategy

| Test | Covers |
| --- | --- |
| `featureBacklog/main.unit.test.ts` | A ticket under a parent with `dependsOn: [x]` resolves with `additionalDependsOnContexts` containing `x`, for a `testImpl` stage and an `impl` stage |
| `featureBacklog/main.unit.test.ts` | A parent without `dependsOn` adds nothing; a top-level item is unchanged |
| `featureBacklog` context-list fixture test (real folders in `os.tmpdir()`) | The layout above produces exactly the `dependsOnContexts` in the example table, including the unchanged `completion` context and deduplication when a ticket's own entry repeats an inherited one |

## Docs updates

| Document | Update |
| --- | --- |
| `packages/apps/cli/DOCS/author/recipes.md` | In the "Big features" paragraph: a ticket waits for its parent's `dependsOn` as well as its own, and its own `dependsOn` names sibling tickets. |

## Acceptance criteria

- [ ] With the layout above, `lumpcode lump-plan <lump> --contexts` lists `persistence` in the dependencies of every `auth-sessions` and `auth-login` context.
- [ ] `auth-login` contexts still list `auth-sessions`.
- [ ] The parent's `completion` context dependencies are unchanged.
- [ ] A parent without `dependsOn` leaves its tickets' dependencies unchanged.
- [ ] `npm run test -w=@lumpcode/recipes` passes, and `npm run build -w=@lumpcode/cli` and `npm run test -w=@lumpcode/cli` pass.
