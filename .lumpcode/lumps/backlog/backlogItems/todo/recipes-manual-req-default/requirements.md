# Requirements: Default `manualReq` to true in feature backlog recipes

| Field | Value |
| --- | --- |
| **Backlog** | `recipes-manual-req-default` · priority **11** · type **feature** · workflow **directImpl** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary: `@lumpcode/recipes` (`featureBacklog`). Generic `backlog` / `abstractionBacklog` / `abstractionFinder` unchanged. `@lumpcode/cli` / `@lumpcode/core` / `@lumpcode/cli-utils` unchanged. |

## Problem statement and motivation

`featureBacklog` today treats omitted `manualReq` as “agent may write `requirements.md`” (`makeReq`). Operators who want human-authored requirements must set `manualReq: true` on every item. Most backlog work in this repo already opts into that, so the safe default is inverted: wait for a human unless the item explicitly opts into agent requirements.

Concrete pain:

1. New `desc.yml` files without `manualReq` silently schedule `_req` contexts and let the agent invent requirements.
2. Campaign authors must remember to stamp `manualReq: true` on every todo and ticket; omissions look like “ready for agent” when they are not.
3. Human review of the requirements gate is the intended control for non-trivial features; agent `makeReq` should be the opt-in exception.

## Goals

1. Omitted `manualReq` on a `featureBacklog` item means “wait for human `requirements.md`” (same runtime behavior as today’s `manualReq: true`).
2. Explicit `manualReq: false` restores today’s agent `makeReq` path when `requirements.md` is missing.
3. Explicit `manualReq: true` stays valid and equivalent to omit.
4. Invalid (non-boolean) `manualReq` still fails at parse with the existing error shape.
5. Operator-facing docs and skills describe the new default and the opt-out.

## Non-goals

- Changing generic `backlog`, `abstractionBacklog`, or `abstractionFinder` (no `manualReq` field there; abstraction items already require a present `requirements.md`).
- Removing the `makeReq` stage, prompts, or `_req` context naming.
- Migrating existing `desc.yml` files that already set `manualReq: true` (redundant but harmless; cleanup optional and out of scope).
- New recipe options, CLI flags, or lump-config knobs that override the per-item default.
- Changing how present `requirements.md` unlocks later stages (`makeTestPlan` / `testImpl` / `implementation` / `directImpl`).
- Changing ticket discovery, workflow parsing, or `manual` workflow ignore rules.

## User stories / use cases

1. **Campaign author (default)** — Adds `todo/foo/desc.yml` with `name`, `task`, `priority` only. No `requirements.md`. Lump plan / run ignores the item until a human writes requirements.
2. **Campaign author (opt out)** — Sets `manualReq: false` on an item without `requirements.md`. Next matching discovery run emits `<name>_req` (`makeReq`) as today.
3. **Campaign author (explicit true)** — Sets `manualReq: true`. Same wait-for-human behavior as omit.
4. **Operator (already has requirements)** — Item has `requirements.md` regardless of `manualReq`. Staging continues as today (workflow-dependent).
5. **Campaign author (bad value)** — Sets `manualReq: "yes"`. Parse throws: field must be a boolean.
6. **Ticket author** — Ticket `desc.yml` omits `manualReq`. Same default as top-level items (per-item field; no parent inheritance).

## Proposed behavior and UX

No CLI syntax changes. Contract is per-item `desc.yml` under `featureBacklog` backlog trees.

### `desc.yml` field

| YAML | Effective `manualReq` | Missing `requirements.md` |
| --- | --- | --- |
| field omitted | `true` | ignore (wait for human) |
| `manualReq: true` | `true` | ignore (wait for human) |
| `manualReq: false` | `false` | stage `makeReq` → context `<base>_req` |
| non-boolean | parse error | — |

`<base>` is the existing context base name (`<name>` or `<parent>-<ticket>`).

Present `requirements.md` is unchanged: `manualReq` does not block later stages.

### Type / parse contract

`FeatureBacklogItem.manualReq` remains optional on the public type for authoring ergonomics. After `parseItem`, resolve treats the effective value as:

- omitted or `true` → human wait when req missing
- `false` → agent `makeReq` when req missing

Canonical owner: **`featureBacklog` `parseItem`** normalizes the field (default true when omitted). **`resolveFeatureBacklogItem`** must not reintroduce a different default; it continues to gate only on the parsed item + `pathExists` for `requirements.md`.

Invalid type still throws:

`Backlog item "<name>" field "manualReq" must be a boolean`

### Operator-visible summary

Default path: human writes `requirements.md` (or uses write-requirements / grilling), then the lump proceeds. Agent-authored requirements require `manualReq: false` on that item.

## Technical approach

| Step | Where | Contract change |
| --- | --- | --- |
| 1 | `packages/recipes/src/recipes/featureBacklog/main.ts` (`parseItem`) | When `manualReq` is omitted, treat as `true`. When `false`, keep `false`. When `true`, keep `true`. Reject non-booleans as today. |
| 2 | `packages/recipes/src/recipes/featureBacklog/main.ts` (`resolveFeatureBacklogItem`) | Keep “no req + manualReq → ignore”; ensure the parsed default makes omit hit that branch. Do not special-case `undefined` differently from `true` if parse always supplies the effective boolean. |
| 3 | `packages/recipes/src/recipes/featureBacklog/main.unit.test.ts` | Update expectations: omit → ignore; add / adjust coverage for `manualReq: false` → `makeReq`; keep invalid-type coverage if present. |
| 4 | Docs / skills (below) | Document default true and opt-out `false`. |

Affected packages/files:

| Path | Role |
| --- | --- |
| `packages/recipes/src/recipes/featureBacklog/main.ts` | Sole behavior owner |
| `packages/recipes/src/recipes/featureBacklog/main.unit.test.ts` | Behavior coverage |
| `packages/recipes/README.md` | Operator docs |
| Repo `AGENTS.md` (featureBacklog bullet) | Agent memory aligned with default |
| `.agents/skills/ideas-to-backlog/SKILL.md` | Promote guidance: omit ≡ wait; `false` = agent makeReq |

Unchanged: `packages/recipes/src/recipes/backlog/**`, abstraction recipes, CLI/core.

## Docs updates

| Document | Change |
| --- | --- |
| `packages/recipes/README.md` | State omit ≡ `manualReq: true` (human requirements); `manualReq: false` enables agent `makeReq`. |
| `AGENTS.md` (featureBacklog / tasks bullets) | Same default / opt-out wording. |
| `.agents/skills/ideas-to-backlog/SKILL.md` | Promote row: `manualReq` optional; omit waits for human requirements; set `false` only when agent should write `requirements.md`. |

No CLI `DOCS/` changes (`manualReq` is recipes-only).

## Acceptance criteria

1. A `featureBacklog` item with no `manualReq` field and no `requirements.md` resolves to `{ ignored: true }` (does not emit `_req`).
2. The same item with `manualReq: false` and no `requirements.md` resolves to stage `makeReq` with context `<base>_req`.
3. `manualReq: true` with no `requirements.md` still resolves to `{ ignored: true }`.
4. With `requirements.md` present, staging is independent of `manualReq` (same as today for that workflow).
5. Non-boolean `manualReq` still throws the existing parse error.
6. Tickets use the same per-`desc.yml` default (no parent inheritance of `manualReq`).
7. `packages/recipes/README.md`, `AGENTS.md`, and ideas-to-backlog skill describe default-true and `manualReq: false` opt-out.
8. No second defaulting path outside `featureBacklog` `parseItem` / its resolve consumer.
