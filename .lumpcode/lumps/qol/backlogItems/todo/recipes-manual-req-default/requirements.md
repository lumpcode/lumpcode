# Requirements: featureBacklog defaults to human-written requirements

| Field | Value |
| --- | --- |
| **Backlog** | `recipes-manual-req-default` · priority **4** · type **behavior change** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | `@lumpcode/recipes` (primary: `featureBacklog`). Docs in `packages/apps/cli/DOCS/`. `@lumpcode/core`, `@lumpcode/cli`, `@lumpcode/cli-utils`, and the generic `backlog` recipe stay unchanged. |

## Problem statement and motivation

A `featureBacklog` item whose `desc.yml` omits `workflow` gets `[req, testPlan, testImpl]` and then `impl`. The `req` stage has the agent write `requirements.md` from a one-line `task`, then the agent writes tests and code from its own plan. The plan is the part a human most needs to own, and by default nobody reviews it before the rest of the pipeline builds on it.

1. A new operator who copies the minimal `desc.yml` (`name`, `task`, `priority`) gets agent-written requirements without choosing that.
2. The opt-in for human requirements (`manualReq`) is the one most operators want, but it is the one they have to remember to type.
3. The old boolean `manualReq: true` field on `desc.yml` is deprecated and ignored, so a stale field silently does nothing.

## Goals

1. An item that omits `workflow` waits for a human `requirements.md`, then runs `testPlan`, `testImpl`, and `impl` as today.
2. An item opts out by listing `req` in its `workflow` (for example `[req, testPlan, testImpl]`), exactly as today.
3. Tickets that omit `workflow` keep inheriting the parent's `workflow`. When the parent also omits it, or the parent `desc.yml` is missing, they get the new default.
4. Docs describe the new default in the one place each page already states it.

## Non-goals

- A lump-level `defaultWorkflow` option on `featureBacklog({…})`. Per-item `workflow` is the opt-out.
- Changing the generic `backlog` recipe, `abstractionBacklog`, or any stage prompt.
- Reviving the deprecated `desc.yml` boolean `manualReq`. It stays ignored, with the same once-per-process warning.
- A warning or migration for items that relied on the old default.
- Changing `workflow` parsing, normalization, or the `req` plus `manualReq` precedence rule.

## User stories / use cases

1. As an operator with a minimal `desc.yml` — the item waits until I commit `requirements.md`, then the agent writes the test plan, tests, and code.
2. As an operator who wants the agent to draft requirements — I add `workflow: [req, testPlan, testImpl]` and get today's behavior.
3. As an operator with an umbrella item — tickets without `workflow` follow the parent's `workflow`. With none on either, they wait for each ticket's `requirements.md`.

## Proposed behavior and UX

| `desc.yml` `workflow` | Before | After |
| --- | --- | --- |
| omitted | `[req, testPlan, testImpl]` then `impl` | `[manualReq, testPlan, testImpl]` then `impl` |
| ticket omitted, parent sets it | parent's | parent's (unchanged) |
| ticket omitted, parent omits it or has no `desc.yml` | `[req, testPlan, testImpl]` | `[manualReq, testPlan, testImpl]` |
| any explicit array | as written | as written (unchanged) |

With the new default and no `requirements.md`, the item resolves to `{ ignored: true }`, the same as an explicit `[manualReq, testPlan, testImpl]`. The `WORKFLOW` context variable for default items becomes `manualReq,testPlan,testImpl`. The new default still has `testPlan` / `testImpl`, so discovery is unchanged: default items run on `<itemDiscoveryBranchPrefix>/<name>` and are ignored on the primary discovery branch.

`DEFAULT_FEATURE_BACKLOG_WORKFLOW` keeps its name and export. Its value becomes `['manualReq', 'testPlan', 'testImpl']`.

## Technical approach

1. In `packages/recipes/src/recipes/featureBacklog/types.ts`, change the value of `DEFAULT_FEATURE_BACKLOG_WORKFLOW`. That constant is the only source of the default. `resolveItemWorkflow` in `resolve.ts` already falls back to it on all three paths (top-level omit, ticket with no parent `desc.yml`, parent without `workflow`), so `resolve.ts` does not change.
2. Update the `featureBacklog` unit tests that assumed the agent `req` stage for default items (below).
3. Update the docs and agent notes that state the old default.

| Area | Files |
| --- | --- |
| Default | `packages/recipes/src/recipes/featureBacklog/types.ts` |
| Tests | `packages/recipes/src/recipes/featureBacklog/main.unit.test.ts` |
| Docs | listed below |

## Testing strategy

| Level | What | Where |
| --- | --- | --- |
| Unit | Default item with no `requirements.md` resolves to `{ ignored: true }` (replaces "routes to req when no requirements document exists") | `featureBacklog/main.unit.test.ts` |
| Unit | Explicit `workflow: ['req', 'testPlan', 'testImpl']` with no `requirements.md` still routes to `req` (`my-feature_req`) | same |
| Unit | Default item with `requirements.md` routes to `testPlan`, then `testImpl`, then `impl`. Existing cases stay, with `defaultWorkflow` updated to `'manualReq,testPlan,testImpl'`. | same |
| Unit | Ticket whose parent omits `workflow` and ticket with no parent `desc.yml` both get the new default (ignored without `requirements.md`) | same |
| Unit | "inherits parent workflow for tickets that omit workflow" unchanged | same |
| Unit | "ignores default-workflow items on the primary discovery branch" unchanged and still passing | same |

Run `npm run test -w=@lumpcode/recipes`. No CLI E2E change.

## Docs updates

| Document | Change |
| --- | --- |
| `packages/apps/cli/DOCS/author/recipes.md` (`workflow` row) | Omitted is `[manualReq, testPlan, testImpl]` then `impl`. List `req` to have the agent write `requirements.md`. |
| `packages/apps/cli/DOCS/examples/backlogs.md` (line on the omitted `workflow`, and the lanes bullet) | Same default. Reword "Write `requirements.md` yourself and use `manualReq` instead of `req`" so `req` is the opt-in for agent-written requirements. |
| `.agents/memory/domain/recipes.md` | `omit ≡ [manualReq, testPlan, testImpl]`. |
| `.agents/skills/write-tickets/SKILL.md`, `.agents/skills/ideas-to-backlog/SKILL.md` | Same default in their `workflow` notes. |

## Acceptance criteria

1. A `featureBacklog` item with no `workflow` and no `requirements.md` gets no context on any discovery branch.
2. The same item with a committed `requirements.md` runs `testPlan`, `testImpl`, then `impl` on its feature branch, as before.
3. An item with `workflow` containing `req` behaves exactly as today.
4. Tickets inherit the parent's `workflow`. With none on either, or no parent `desc.yml`, they get the new default.
5. `DEFAULT_FEATURE_BACKLOG_WORKFLOW` is the only place the default is defined. No other recipe file hardcodes a fallback workflow.
6. `npm run test -w=@lumpcode/recipes` passes. The docs and agent notes listed above state the new default, and none still says omitted means `req`.
