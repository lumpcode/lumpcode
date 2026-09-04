# Requirements: Default `manualReq` to true in featureBacklog

| Field | Value |
| --- | --- |
| **Backlog** | `recipes-manual-req-default` · priority **11** · type **feature** · workflow **directImpl** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary: `packages/recipes` (`featureBacklog`). Docs: `@lumpcode/recipes` README, website author recipes page, repo skills / `AGENTS.md` as needed. CLI / core / `cli-types` / `cli-utils` **unchanged**. |

## Problem statement and motivation

`featureBacklog` can auto-run a `makeReq` stage that has an agent write `requirements.md` when that file is missing. Human-authored requirements are the safer default for this repo and for most feature campaigns: agent-drafted specs are easy to accept without review and lock in a weak plan before test plan / implementation. Today authors must opt in with `manualReq: true` on every item that should wait for a human; omit means the agent writes the requirements.

Pain points:

1. Omit `manualReq` schedules agent `makeReq` — easy to forget, hard to notice until a `_req` branch appears.
2. Opt-in human requirements force boilerplate `manualReq: true` on most `desc.yml` files (this monorepo already does that repeatedly).
3. Product intent (“requirements are a human gate”) is inverted relative to the field name and how operators actually use the backlog.

## Goals

1. **Default human requirements** — for `featureBacklog`, missing `requirements.md` waits for a human unless the item explicitly opts out.
2. **Explicit agent opt-out** — `manualReq: false` restores today’s agent `makeReq` when requirements are missing.
3. **Preserve semantics of true** — `manualReq: true` (and omit) still ignore the item until `requirements.md` exists; once the file exists, staging continues as today (`makeTestPlan` / `testImpl` / `implementation` / `directImpl`).
4. **Single ownership** — normalize and apply the default only inside `featureBacklog` parse / resolve; do not invent a parallel `manualReq` on generic `backlog` or abstraction recipes.
5. **Docs** — operator-facing copy and repo authoring skills describe omit ≡ true and `false` as the agent opt-out.

## Non-goals

- Adding `manualReq` to generic `backlog`, `abstractionFinder`, or `abstractionBacklog` (abstraction implementer already skips items without `requirements.md`; finder writes its own artifacts).
- Changing `makeReq` prompt text, artifact path (`requirements.md`), or TDD / `directImpl` stage order once requirements exist.
- Changing `workflow: manual` (still always ignored) or discovery / ticket routing.
- Auto-migrating existing `desc.yml` files (redundant `manualReq: true` may stay; no mass rewrite required).
- CLI flags, schema changes outside recipes item YAML, or core engine changes.
- Deprecating or renaming the `manualReq` field.

## User stories / use cases

1. **Author (default)** — Adds `todo/<name>/desc.yml` with `name` / `task` / `priority` and no `manualReq`. Until someone writes `requirements.md`, the item does not emit a context (ignored). After the human file lands, the usual next stage runs.
2. **Author (agent requirements)** — Sets `manualReq: false`. With no `requirements.md`, `featureBacklog` emits the `makeReq` context (`<name>_req` or ticket-prefixed equivalent) as today.
3. **Author (explicit human)** — Sets `manualReq: true`. Behavior matches omit (wait for human file). Valid and redundant after the default change.
4. **Ticket author** — Same rules on `todo/<parent>/tickets/<ticket>/desc.yml`; each ticket’s own `manualReq` / omit applies (no inheritance from the parent folder).
5. **Operator / docs reader** — README and website state that human requirements are the default and `manualReq: false` opts into agent `makeReq`.

## Proposed behavior and UX

### `desc.yml` contract (`featureBacklog` only)

| `manualReq` in YAML | Effective value | Missing `requirements.md` |
| --- | --- | --- |
| omitted | `true` | Item ignored (no `makeReq`) |
| `true` | `true` | Item ignored (no `makeReq`) |
| `false` | `false` | Stage `makeReq` (agent writes requirements) |
| non-boolean | Parse error (unchanged message shape) | — |

Once `requirements.md` exists, `manualReq` does not affect later stages (unchanged).

Type stays optional boolean on `FeatureBacklogItem`:

```ts
manualReq?: boolean; // omit ≡ true after parse/normalize
```

### Resolve gate

In `resolveFeatureBacklogItem`, when requirements are missing:

| Effective `manualReq` | Result |
| --- | --- |
| `true` (default) | `{ ignored: true }` |
| `false` | `{ stage: 'makeReq', contextName, variables: { REQ_FILE } }` as today |

### Breaking change (intentional)

Consumers that relied on **omit → agent `makeReq`** must set `manualReq: false` on those items. No compatibility shim that keeps the old default.

### Example YAML

Human gate (default — field may be omitted):

```yaml
name: my-feature
task: Implement the thing.
priority: 10
```

Agent-authored requirements:

```yaml
name: my-feature
task: Implement the thing.
priority: 10
manualReq: false
```

## Technical approach

| Step | Owner | Contract change |
| --- | --- | --- |
| 1. Normalize at parse | `featureBacklog` `parseItem` in [`packages/recipes/src/recipes/featureBacklog/main.ts`](../../../../../../packages/recipes/src/recipes/featureBacklog/main.ts) | Keep boolean validation. Stop collapsing `false` to `undefined`. Effective value: omitted or `true` → treat as human-wait; only `false` opts into agent `makeReq`. Prefer storing a concrete boolean after parse (e.g. `manualReq: record.manualReq !== false`) so resolve does not re-default. |
| 2. Resolve gate | `resolveFeatureBacklogItem` (same module) | Gate missing requirements on effective human-wait (`manualReq !== false` if left optional, or `=== true` if always normalized to boolean). Do not duplicate the default in generic `backlog` or kit. |
| 3. Tests | `featureBacklog` unit suite | Update “no requirements” case: default / omit / `true` → ignored; `false` → `makeReq`. Adjust any fixtures that assumed omit ⇒ `makeReq`. |
| 4. Docs / skills | See Docs updates | Wording only; no new APIs. |

**Canonical owner:** `featureBacklog` parse + resolve only. Callers and other recipes must not reimplement a second `manualReq` default.

**Unaffected:** generic `backlog` stage map, `folderBacklogContexts` (still passes through `parseItem`), `abstractionFinder` / `abstractionBacklog`, CLI, core.

## Docs updates

| Document | Change |
| --- | --- |
| [`packages/recipes/README.md`](../../../../../../packages/recipes/README.md) | `desc.yml` / featureBacklog prose: omit `manualReq` ≡ wait for human `requirements.md`; `manualReq: false` opts into agent `makeReq`. Drop “`manualReq: true` waits…” as the primary framing. |
| [`packages/apps/website/content/docs/author/recipes.md`](../../../../../../packages/apps/website/content/docs/author/recipes.md) | Same default / opt-out wording for `featureBacklog`. |
| [`.agents/skills/ideas-to-backlog/SKILL.md`](../../../../../../.agents/skills/ideas-to-backlog/SKILL.md) | Promote row: note omit ≡ human requirements; set `manualReq: false` when the agent should draft `requirements.md`. |
| [`AGENTS.md`](../../../../../../AGENTS.md) (repo memory) | `featureBacklog` bullet: default `manualReq` true / omit ≡ human; `false` for agent `makeReq`. |

No CLI `DOCS/` or `lumpConfig.schema.json` changes (field is recipe item YAML, not lump config schema).

## Acceptance criteria

1. A `featureBacklog` item with no `manualReq` and no `requirements.md` is ignored (no `_req` / `makeReq` context).
2. The same item with `manualReq: false` and no `requirements.md` resolves to `makeReq` with today’s context naming and `REQ_FILE` variable.
3. `manualReq: true` with no `requirements.md` remains ignored; with `requirements.md` present, later stages match current TDD / `directImpl` behavior.
4. Invalid non-boolean `manualReq` still throws at parse with a clear item-scoped error.
5. Tickets apply the same omit / `true` / `false` rules from their own `desc.yml`.
6. Generic `backlog`, abstraction recipes, CLI, and core have no new `manualReq` API or default.
7. Recipes README, website recipes page, ideas-to-backlog skill, and `AGENTS.md` document omit ≡ human and `false` as the agent opt-out.
8. No second default/normalization of `manualReq` outside `featureBacklog` parse / resolve.
