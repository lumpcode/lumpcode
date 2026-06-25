# PRD: Multi `projectBaseBranches` (integration-branch-aware runs)

| Field | Value |
| --- | --- |
| **Backlog** | `multi-project-base-branches` · priority **1** · type **feature** |
| **Release goal** | [GOALS.md](../GOALS.md) — v0.0.9 main feature |
| **Design reference** | [multi-project-base-branches.reference.md](../multi-project-base-branches.reference.md) |
| **Depends on** | None |
| **Packages** | `packages/apps/cli` (primary); `packages/apps/cli/cli-types` (if `allowUnlistedBaseBranch` needs `defineConfig` typing); `@lumpcode/core` unchanged except existing `getToDoContextList` / `getContextStatus` behavior preserved |

## Problem statement and motivation

Today Lumpcode treats **one** integration branch per machine (`local.json` `projectBaseBranch`). Pre-flight always resets the execution workspace to that branch before any lump runs. Lumps may override `baseBranch`, but discovery and daemon inventory still assume a single checkout line:

1. **Wrong discovery tree (dedicated)** — `getToDoContextList` reads source `projectRoot` before `setupWorkspaceFn` switches to the lump branch. If pre-flight targeted the wrong integration branch, `TODO.yaml`, PRD checks, and file scans reflect the wrong tree.
2. **Branch-local lumps invisible to daemons** — `discoverLoadableLumpNames` reads `.lumpcode/lumps/` on the current checkout. A dedicated runner pinned to `main` never sees lumps that exist only on `ver/0.0.7`.
3. **No allowlist** — A lump can declare any `baseBranch` with no tie to branches this installation is allowed to operate on.

v0.0.9 adds an optional **`projectBaseBranches`** allowlist, validates lump `baseBranch` against it, pre-flights to each lump's integration branch for runs, and lets dedicated daemons discover and run lumps across listed branches.

## Goals

1. **`projectBaseBranches` in `local.json`** — Optional non-empty `string[]`; when present it wins over singular `projectBaseBranch` for the effective integration-branch list; reject empty array and duplicates at parse. **`projectBaseBranch` is optional when `projectBaseBranches` is non-empty**; at least one of the two must be set.
2. **`resolveProjectBaseBranches(localConfig)`** — Single helper: array wins, else `[projectBaseBranch]`; never merge the two fields. **`resolvePrimaryProjectBaseBranch(localConfig)`** — `projectBaseBranch ?? resolveProjectBaseBranches(localConfig)[0]` for callers that need one branch (default pre-flight target, lump `baseBranch` fallback).
3. **Lump allowlist** — Resolved `baseBranch` must be in the effective list unless `allowUnlistedBaseBranch: true` on the lump config.
4. **Manual `run`** — Config from current checkout only; validate allowlist; pre-flight execution workspace to lump's `baseBranch`.
5. **Dedicated daemon** — Launch-time fail-fast registry scan; each tick loops effective branches in **array order**, pre-flights each, runs **all** eligible lumps on that branch sequentially; tick-time skip bad lumps without crashing.
6. **`start --lumpName`** — Verify lump `baseBranch` in list at launch; each tick pre-flight to that branch only.
7. **Shared mode contract** — Execute on copy at lump `baseBranch`; discover from source (intentional — local edit without push). Document; do not read discovery from copy.
8. **`makeLumpWorkspaceFns`** — Teardown / worktree switch-back uses lump resolved `baseBranch`, not the primary integration branch from `local.json` when they differ.
9. **`clean`** — No pre-flight; delete lump branches on remote, local checkout, and shared copy.
10. **Cross-lump dep warning** — At daemon launch, warn when `dependsOnContexts` references `otherLump/ctx` and `otherLump.baseBranch !== thisLump.baseBranch` (both lumps visible on same branch).
11. **User docs** — Update CLI DOCS for new fields, daemon behavior, shared vs dedicated discovery, cross-lump dep rule, and clean behavior.

## Non-goals

- **LRU or branch scheduling meta** — Branch order is fixed array order every tick.
- **Cross-branch cross-lump dependency resolution** — Markers checked on demanding lump's `baseBranch` only; no loading `otherLump` config from another branch.
- **`GetContextListFnInput.baseBranch`** — No new field in v0.0.9.
- **Shared-mode multi-branch daemon scan** — Dedicated only for per-branch discovery loop.
- **Manual `run` cross-branch config load** — Fail if lump config not on current checkout.
- **Caching double `getToDoContextList`** — Separate follow-up.
- **`lump-plan` / `lump-status` pre-flight** — Stay non-destructive.
- **`project-setup` scaffolding `projectBaseBranches`** — Operators add manually when needed; scaffold keeps singular `projectBaseBranch` only.

## User stories / use cases

1. **Release-line daemon** — I list `["main", "ver/0.0.9"]` in `local.json`; dedicated daemon discovers lumps on both lines and runs them each tick in branch order.
2. **Array-only config** — I set only `projectBaseBranches: ["main", "ver/0.0.9"]` without `projectBaseBranch`; parse succeeds and primary branch defaults to the first array element.
3. **Single-branch unchanged** — I only set `projectBaseBranch: main`; behavior matches today (effective list `["main"]`).
4. **Shared-mode local edit** — I edit a lump on source without pushing; `run` discovers from source while execution uses the synced copy at the lump's integration branch.
5. **Allowlist guard** — A lump with `baseBranch: ver/0.0.7` fails `run` when that branch is not listed; `allowUnlistedBaseBranch: true` restores legacy behavior.
6. **Clean all workspaces** — `lumpcode clean` removes lump branches from origin, my checkout, and the shared copy without switching branches first.

## Docs updates

| Document | What to change |
| --- | --- |
| [packages/apps/cli/DOCS/local-config.md](../../../../packages/apps/cli/DOCS/local-config.md) | `projectBaseBranches`, precedence, validation, shared execute-on-copy / discover-on-source, local-edit-without-push, daemon branch-ordered tick throughput |
| [packages/apps/cli/DOCS/lump-config.md](../../../../packages/apps/cli/DOCS/lump-config.md) | `baseBranch` allowlist, `allowUnlistedBaseBranch`, cross-lump `dependsOnContexts` (demanding lump's branch) |
| [packages/apps/cli/DOCS/concepts.md](../../../../packages/apps/cli/DOCS/concepts.md) | Integration-branch allowlist, three-workspaces note for shared discovery |
| [packages/apps/cli/DOCS/commands.md](../../../../packages/apps/cli/DOCS/commands.md) | Daemon launch validation, tick shape, `clean` without pre-flight |
| [AGENTS.md](../../../../AGENTS.md) | Workspace facts when implementation lands (may already note v0.0.9 planned — align with shipped behavior) |

Update JSON schemas: `localConfig.schema.json`, `lumpConfig.schema.json`. No migration guides unless explicitly requested.

## Proposed behavior

### `local.json`

**`projectBaseBranch`** remains the single-branch field (required when `projectBaseBranches` is omitted). Add optional **`projectBaseBranches`**: non-empty `string[]`, no duplicates. **When `projectBaseBranches` is present and non-empty, `projectBaseBranch` may be omitted.** At parse, require at least one of the two.

Multi-branch example (singular optional):

```json
{
  "mode": "dedicated",
  "projectBaseBranches": ["main", "ver/0.0.9"],
  "workspaceStrategy": "checkout"
}
```

Both fields may still be set for backward compatibility:

```json
{
  "mode": "dedicated",
  "projectBaseBranch": "main",
  "projectBaseBranches": ["main", "ver/0.0.9"],
  "workspaceStrategy": "checkout"
}
```

When both are set, **`projectBaseBranches` wins** for the effective list; do not merge arrays. Branch existence on `origin` is validated lazily at pre-flight.

**Primary branch** (single value for defaults): `projectBaseBranch` when set, else the **first element** of `projectBaseBranches`.

### Lump config

- Resolved `baseBranch` = `config.baseBranch ?? resolvePrimaryProjectBaseBranch(localConfig)` (existing fallback chain for lump config may also consider `project.json` per v0.0.7 rules — preserve existing resolution, then allowlist check).
- **`allowUnlistedBaseBranch?: boolean`** — When `true`, skip allowlist validation for that lump.

### Pre-flight primitive (unchanged)

`pullProjectBaseBranch` / `runPreflight`: `git fetch --all`, `git switch <branch>`, `git reset --hard origin/<branch>`, `git pull origin <branch>`.

**New:** callers pass **which branch** via optional `targetBranch` on `runProjectPreflight` (default `resolvePrimaryProjectBaseBranch(localConfig)` for backward-compatible paths).

### Manual `lumpcode run`

1. `getJsConfigFromLumpName` from **current checkout** — fail if not found (no cross-branch scan).
2. Validate resolved `baseBranch` against effective list (unless opt-out).
3. `runProjectPreflight({ targetBranch: lumpBaseBranch })`.
4. `runLumpFromJsConfig`.

### Dedicated daemon — launch validation (fail immediately)

Before scheduler starts:

1. Resolve effective branch list.
2. **Global daemon:** for each branch in order, pre-flight once, `discoverLoadableLumpNames`, record `(lumpName, baseBranch)`.
3. Fail launch if: duplicate `lumpName` across branches; unlisted `baseBranch` (without opt-out); unloadable config.
4. Emit **warnings** for cross-lump `baseBranch` mismatch on `dependsOnContexts` (see reference doc).
5. Surface all **errors** in one response.

**`start --lumpName`:** load lump config; verify `baseBranch` in list; fail launch if not. No multi-branch scan.

### Dedicated daemon — each tick

**Global (dedicated):**

For each branch in effective list **in array order**:

- Pre-flight to branch.
- Discover lumps; for each eligible lump (not disabled, passes allowlist): `runLumpFromJsConfig` with `lockMode: 'wait'`.
- On lump failure: log, continue. Do not crash daemon.

**`start --lumpName`:** pre-flight to lump `baseBranch`; run that lump only.

**Shared mode daemon:** no multi-branch scan; one pre-flight per tick; discover from source; run all eligible lumps (today's inner loop).

### Shared mode: execution vs discovery

| Concern | Where |
| --- | --- |
| Execution (agent, commits) | Copy at `~/.lumpcode/project-copies/<projectName>/`, pre-flight to lump `baseBranch` |
| Discovery (`getContextListFn`, file scans) | **Source** `projectRoot` |

Intentional — enables editing lumps locally without pushing. Document clearly.

### `makeLumpWorkspaceFns`

Pass **lump resolved `baseBranch`** into workspace fns for checkout teardown (`git switch …`) and worktree setup switch-back — not the primary integration branch from `local.json` when they differ.

Wire from `jsConfigToRunLumpInput` after resolving lump `baseBranch`.

### `lumpcode clean`

Remove `runProjectPreflight`. For each target workspace (source `projectRoot`, shared copy if exists):

- `git fetch --all` where needed for remote delete only.
- Delete matching lump branches locally and on `origin` (`lump/<lumpName>/*`, respect `--lumpName` / `--contextName`).
- Remove worktrees under `.lumpcode/worktrees/`.
- **Do not** switch branches.

### `dependsOnContexts` (preserve + document)

- Same-lump and cross-lump checks use **demanding lump's `baseBranch`** on `origin/<that branch>`.
- Marker must be **`finished`** on that ref.
- Do not load `otherLump` config for cross-branch resolution in v0.0.9.

## Technical approach

Implement in this order (each step should leave the repo in a committable state):

### Phase 1 — Config and helpers

| Item | Location |
| --- | --- |
| `projectBaseBranch?: string`, `projectBaseBranches?: string[]` | `packages/apps/cli/src/types/LocalConfig.ts`, `schemas/localConfig.schema.json` |
| Zod: reject empty array, duplicates; require at least one of `projectBaseBranch` or non-empty `projectBaseBranches` | `packages/apps/cli/src/utils/readLocalConfig/main.ts` |
| `resolveProjectBaseBranches`, `resolvePrimaryProjectBaseBranch` | new util under `packages/apps/cli/src/utils/resolveProjectBaseBranches/` + barrel export |
| `resolveLumpBaseBranch` | new util (or inline in validation helper) |
| `validateLumpBaseBranchAllowlist` | new util; uses `Success`/`Failure` from core |
| `allowUnlistedBaseBranch` | `LumpJsConfig`, `lumpConfig.schema.json`, cli-types if needed |

### Phase 2 — Pre-flight and workspace

| Item | Location |
| --- | --- |
| `targetBranch` on `runProjectPreflight` | `packages/apps/cli/src/utils/runProjectPreflight/main.ts` |
| Lump `baseBranch` into `makeLumpWorkspaceFns` | `makeLumpWorkspaceFns/main.ts`, `jsConfigToRunLumpInput/main.ts` |

### Phase 3 — Commands

| Item | Location |
| --- | --- |
| `run` reorder + allowlist | `packages/apps/cli/src/commands/run/main.ts` |
| Allowlist in `runLumpFromJsConfig` | `packages/apps/cli/src/utils/runLumpFromJsConfig/main.ts` |
| Allowlist in `planLumpFromJsConfig` | `packages/apps/cli/src/utils/planLumpFromJsConfig/main.ts` |
| Daemon launch validation + branch-ordered tick | `packages/apps/cli/src/commands/start/main.ts`; extract helpers if `start/main.ts` grows (e.g. `discoverLumpRegistryAcrossBranches`, `validateDaemonLaunch`) |
| Per-lump daemon behavior | same file, `--lumpName` path |
| Cross-lump mismatch warning | daemon launch registry builder |
| `clean` without pre-flight | `packages/apps/cli/src/commands/clean/main.ts`; reuse `getExecutionWorkspacePath` / project name resolution for copy path |

### Phase 4 — Docs and AGENTS.md

Apply [Docs updates](#docs-updates) after behavior is implemented.

### Key existing files (read before editing)

- `runPreflight/main.ts` — keep primitive unchanged
- `discoverLoadableLumpNames/main.ts` — daemon discovery
- `resolveProjectExecutionContext/main.ts` — non-destructive path for plan/status
- `readDaemonMeta/main.ts` — no new LRU meta fields in v0.0.9

### Out of scope for implementer

- Editing [TODO.yaml](../TODO.yaml) (move entry to `DONE.yaml` when feature ships).
- npm package cross-links (separate backlog task `npm-package-cross-links`).

## Acceptance criteria

1. **Effective list** — `projectBaseBranches` when set wins; singular-only installs behave as today; array-only installs use the array as the effective list.
2. **Parse validation** — Empty `projectBaseBranches`, duplicates, and configs with neither field rejected with clear errors; non-empty `projectBaseBranches` without `projectBaseBranch` accepted.
3. **Allowlist** — `run` and daemon launch fail when lump `baseBranch` not listed; opt-out works.
4. **Manual `run`** — Pre-flight targets lump `baseBranch`; fails if lump config absent on current checkout.
5. **Dedicated daemon** — Launch fails on duplicate lump name across branches; tick runs all lumps per branch in list order; bad lump at tick time does not stop daemon.
6. **`start --lumpName`** — Validates listed `baseBranch` at launch; tick uses that branch only.
7. **Shared mode** — Discovery still reads source; execution copy pre-flights to lump branch.
8. **Workspace teardown** — Returns to lump resolved `baseBranch`.
9. **`clean`** — No pre-flight; cleans remote, local, and shared copy.
10. **Docs** — User-facing DOCS reflect shipped behavior; schemas updated.
11. **Cross-lump warning** — Logged at daemon launch when configured deps span mismatched lump `baseBranch` values on the same branch.

## Open questions and risks

| # | Risk | Mitigation |
| --- | --- | --- |
| 1 | Long daemon ticks (N branches × M lumps) | Document throughput; Croner `{ protect: true }` already serializes ticks |
| 2 | Launch scan cost (pre-flight per branch) | Accept for v0.0.9; log duration |
| 3 | `clean` without knowing current branch | Use `git ls-remote` / branch list patterns; do not require checkout switch |
| 4 | Shared discovery stale vs copy | Document operator workflow; by design |
| 5 | Duplicate lump names across branches | Fail at daemon launch only (not tick) |
