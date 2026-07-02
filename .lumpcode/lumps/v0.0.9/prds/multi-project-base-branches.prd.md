# PRD: Multi discovery branches (integration-line-aware discovery and runs)

| Field | Value |
| --- | --- |
| **Backlog** | `multi-project-base-branches` · priority **1** · type **feature** |
| **Release goal** | [GOALS.md](../GOALS.md) — v0.0.9 main feature |
| **Design reference** | [multi-project-base-branches.reference.md](../multi-project-base-branches.reference.md) |
| **Depends on** | None |
| **Packages** | `packages/apps/cli` (primary); `packages/apps/cli/cli-types` (`discoveryBranch` on `defineConfig`); `@lumpcode/core` unchanged except existing `getToDoContextList` / `getContextStatus` behavior preserved |

## Problem statement and motivation

Today Lumpcode conflates two concerns under lump **`baseBranch`**: the git integration line for execution (markers, pre-flight, worktrees) and the integration line where lump config and context sources live for discovery. **`local.json`** also exposes a single **`projectBaseBranch`**, which drives pre-flight before every run even when lumps target other lines.

1. **Wrong discovery tree (dedicated)** — `getToDoContextList` reads source `projectRoot` before `setupWorkspaceFn` switches to the lump branch. If the checkout was not on the line where the lump folder exists, `TODO.yaml`, PRD checks, and file scans reflect the wrong tree.
2. **Branch-local lumps invisible to daemons** — `discoverLoadableLumpNames` reads `.lumpcode/lumps/` on the current checkout. A dedicated runner pinned to `main` never sees lumps that exist only on `ver/0.0.9`.
3. **No discovery allowlist (dedicated)** — A lump can declare any `discoveryBranch` with no tie to branches this installation may scan.

v0.0.9 splits **`baseBranch`** (execution) from **`discoveryBranch`** (inventory/discovery), renames **`local.json`** fields to **`discoveryBranch` / `discoveryBranches`**, validates **`discoveryBranch`** against the effective list in **dedicated mode only**, and lets dedicated daemons loop discovery branches each tick.

## Goals

1. **`discoveryBranch` / `discoveryBranches` in `local.json`** — Replace `projectBaseBranch` / `projectBaseBranches`. Non-empty `discoveryBranches` wins; else `[discoveryBranch]`. Parse rejects empty array, duplicates, and configs with neither field set.
2. **Helpers** — `resolveDiscoveryBranches(localConfig)`, `resolvePrimaryDiscoveryBranch(localConfig)` (= first element of effective list).
3. **Lump `discoveryBranch`** — Optional; default `primaryDiscoveryBranch`. **Allowlisted** in dedicated mode only (`run`, `lump-plan`, `lump-status`, daemon). **`baseBranch` is not allowlisted.**
4. **Lump `baseBranch` resolution** — `baseBranch ?? discoveryBranch ?? primaryDiscoveryBranch ?? project.json projectBaseBranch` (legacy **`project.json`** field last).
5. **Manual `run`** — Config from current checkout only; dedicated: validate discovery allowlist; pre-flight execution workspace to **`resolvedBaseBranch`**.
6. **Dedicated daemon** — Launch fail-fast (duplicate lump name on same discovery scan, unlisted `discoveryBranch`, unloadable config); each tick loops discovery branches in order → pre-flight → discover matching lumps → pre-flight each to **`resolvedBaseBranch`** → run.
7. **`start --lumpName`** — Load config from **current checkout** at launch; dedicated: validate `discoveryBranch` in list; tick pre-flights to lump **`resolvedBaseBranch`**.
8. **Shared mode** — No branch-aware discovery loop; **no allowlist**; lump **`discoveryBranch` ignored**; if `discoveryBranches.length > 1`, log info/warning once and behave as single-primary. Execute on copy at lump **`baseBranch`**; discover from source (intentional).
9. **`makeLumpWorkspaceFns`** — Teardown / worktree switch-back uses lump **`resolvedBaseBranch`**, not primary discovery branch when they differ.
10. **`clean`** — No pre-flight; delete lump branches on remote, local checkout, and shared copy.
11. **Cross-lump dep warning** — At daemon launch, warn when `dependsOnContexts` references `otherLump/ctx` and `otherLump.baseBranch !== thisLump.baseBranch` (both lumps visible on same discovery scan).
12. **User docs** — Update CLI DOCS for new fields, dedicated vs shared discovery, cross-lump dep rule, and clean behavior.

## Non-goals

- **LRU or branch scheduling meta** — Discovery branch order is fixed array order every tick.
- **Cross-branch cross-lump dependency resolution** — Markers checked on demanding lump's `baseBranch` only.
- **`GetContextListFnInput.baseBranch`** — No new field in v0.0.9.
- **Shared-mode multi-branch daemon scan** — Dedicated only.
- **Manual `run` cross-branch config load** — Fail if lump config not on current checkout.
- **`allowUnlistedBaseBranch`** — Removed; use explicit `discoveryBranch` / `baseBranch` instead.
- **Cross-discovery-branch duplicate lumpName fail** — Same `lumpName` on `main` and `ver/0.0.9` with matching `discoveryBranch` each is allowed.
- **Caching double `getToDoContextList`** — Separate follow-up.
- **`lump-plan` / `lump-status` pre-flight** — Stay non-destructive (no git switch).
- **`project-setup` scaffolding `discoveryBranches`** — Operators add manually; scaffold may keep singular field only.

## User stories / use cases

1. **Release-line daemon** — I list `discoveryBranches: ["main", "ver/0.0.9"]` in `local.json`; dedicated daemon discovers and runs lumps on both lines each tick in array order.
2. **Array-only config** — I set only `discoveryBranches: ["main", "ver/0.0.9"]` without singular `discoveryBranch`; parse succeeds; primary is `main`.
3. **Single-branch unchanged** — I only set `discoveryBranch: main`; behavior matches today (`effectiveDiscoveryBranches` = `["main"]`).
4. **Execute vs discover split** — Lump on `main` with `discoveryBranch: main`, `baseBranch: ver/0.0.9`: discovered on `main` pass, git work on `ver/0.0.9`.
5. **Same name, two lines** — Lump `release` on `main` and lump `release` on `ver/0.0.9` (each with matching `discoveryBranch`); daemon runs both; no cross-branch duplicate fail.
6. **Shared-mode local edit** — I edit a lump on source without pushing; `run` discovers from source while execution uses the synced copy at the lump's `baseBranch`.
7. **Dedicated allowlist guard** — A lump with `discoveryBranch: ver/0.0.7` fails `run` / `lump-plan` when that branch is not in `discoveryBranches`.
8. **Clean all workspaces** — `lumpcode clean` removes lump branches from origin, my checkout, and the shared copy without switching branches first.

## Docs updates

| Document | What to change |
| --- | --- |
| [packages/apps/cli/DOCS/local-config.md](../../../../packages/apps/cli/DOCS/local-config.md) | `discoveryBranch` / `discoveryBranches`, precedence, dedicated vs shared, daemon branch-ordered tick throughput |
| [packages/apps/cli/DOCS/lump-config.md](../../../../packages/apps/cli/DOCS/lump-config.md) | `baseBranch`, `discoveryBranch`, resolution chains, cross-lump `dependsOnContexts` |
| [packages/apps/cli/DOCS/concepts.md](../../../../packages/apps/cli/DOCS/concepts.md) | Discovery branch vs execution branch, three workspaces for shared mode |
| [packages/apps/cli/DOCS/commands.md](../../../../packages/apps/cli/DOCS/commands.md) | Daemon launch/tick, `start --lumpName` current-checkout rule, `clean` without pre-flight |
| [AGENTS.md](../../../../AGENTS.md) | Workspace facts when implementation lands |

Update JSON schemas: `localConfig.schema.json`, `lumpConfig.schema.json`. **`project.json` `projectBaseBranch` unchanged** (legacy tail of `baseBranch` fallback). No migration guides unless explicitly requested.

## Proposed behavior

### `local.json`

Add **`discoveryBranch`** (singular) and **`discoveryBranches`** (non-empty `string[]`, no duplicates). **Replace** `projectBaseBranch` / `projectBaseBranches` in `local.json` (not in `project.json`).

**Effective discovery list:**

```text
effectiveDiscoveryBranches =
  discoveryBranches non-empty ? discoveryBranches : [discoveryBranch]

primaryDiscoveryBranch = effectiveDiscoveryBranches[0]
```

When **`discoveryBranches` is non-empty**, it **wins** over singular `discoveryBranch` (do not merge). Require at least one of the two at parse. Branch existence on `origin` is validated lazily at pre-flight.

Multi-branch example (array only):

```json
{
  "mode": "dedicated",
  "discoveryBranches": ["main", "ver/0.0.9"],
  "workspaceStrategy": "checkout"
}
```

### Lump config

| Field | Role |
| --- | --- |
| **`baseBranch`** | Git integration line: pre-flight for execution, markers, `finished`, worktrees. **Not allowlisted.** |
| **`discoveryBranch`** | Integration line for inventory/discovery scheduling. Optional; default `primaryDiscoveryBranch`. **Allowlisted in dedicated only.** Ignored in shared mode. |

**Resolution:**

```text
resolvedDiscoveryBranch = lump.discoveryBranch ?? primaryDiscoveryBranch

resolvedBaseBranch =
  lump.baseBranch
  ?? lump.discoveryBranch
  ?? primaryDiscoveryBranch
  ?? project.json projectBaseBranch
```

When `baseBranch` is omitted, execution defaults to the discovery line (common case).

### Dedicated allowlist

Apply only when `local.json` `mode` is **`dedicated`**:

- **`run`**, **`lump-plan`**, **`lump-status`**, daemon launch/tick: `resolvedDiscoveryBranch ∈ effectiveDiscoveryBranches` or fail with clear message.
- **`baseBranch`** may be any branch (not validated against the list).

**Shared mode:** no allowlist on any command; lump `discoveryBranch` ignored.

### Pre-flight primitive (unchanged)

`pullProjectBaseBranch` / `runPreflight`: `git fetch --all`, `git switch <branch>`, `git reset --hard origin/<branch>`, `git pull origin <branch>`.

Callers pass **which branch** via optional `targetBranch` on `runProjectPreflight`.

### Manual `lumpcode run`

1. `getJsConfigFromLumpName` from **current checkout** — fail if not found.
2. Dedicated: validate `resolvedDiscoveryBranch` against effective list.
3. `runProjectPreflight({ targetBranch: resolvedBaseBranch })`.
4. `runLumpFromJsConfig`.

### Dedicated daemon — launch validation

Before scheduler starts:

1. Resolve effective discovery list.
2. **Global daemon:** for each branch in order, pre-flight once, `discoverLoadableLumpNames`, resolve each lump's `discoveryBranch` / `baseBranch`.
3. Fail launch if:
   - **Same discovery-branch scan:** duplicate `lumpName` twice (same checkout after pre-flight to one discovery branch).
   - Unlisted `discoveryBranch`.
   - Unloadable config.
4. **Do not fail** for same `lumpName` on different discovery branches (e.g. `A` on `main` and `A` on `ver/0.0.9`).
5. Optional **warning** if a lump's `discoveryBranch` ≠ branch being scanned (misalignment).
6. Emit cross-lump **`baseBranch`** mismatch warnings on `dependsOnContexts`.

**`start --lumpName`:** load lump from **current checkout**; dedicated: verify `discoveryBranch` in list; no full multi-branch registry requirement beyond that lump.

### Dedicated daemon — each tick

For each branch in **`effectiveDiscoveryBranches`** (array order):

1. Pre-flight execution workspace to that **discovery** branch (reset before discover).
2. Discover lumps; keep those where `resolvedDiscoveryBranch ===` current branch.
3. For each eligible lump: pre-flight to **`resolvedBaseBranch`**, then `runLumpFromJsConfig` with `lockMode: 'wait'`.
4. Skip bad lumps at tick time (log, continue).

**`start --lumpName`:** each tick pre-flight to lump **`resolvedBaseBranch`**; run that lump only.

### Shared mode daemon

- No multi-branch discovery loop.
- If `effectiveDiscoveryBranches.length > 1`: log **info/warning** once per start that multi-discovery is dedicated-only; use **`primaryDiscoveryBranch`** for shared defaults where a single primary is needed.
- Discover all loadable lumps from **source**; pre-flight copy per lump **`resolvedBaseBranch`**; no allowlist.

### Shared mode: execution vs discovery

| Concern | Where |
| --- | --- |
| Execution (agent, commits) | Copy at `~/.lumpcode/project-copies/<projectName>/`, pre-flight to lump **`resolvedBaseBranch`** |
| Discovery (`getContextListFn`, file scans) | **Source** `projectRoot` (user-managed checkout) |

Intentional — enables editing lumps locally without pushing.

### `makeLumpWorkspaceFns`

Teardown / worktree switch-back uses lump **`resolvedBaseBranch`**, not `primaryDiscoveryBranch` when they differ.

### `lumpcode clean`

No pre-flight. Delete lump branches on remote, local checkout, shared copy, and worktrees under `.lumpcode/worktrees/`. Do not switch branches.

### `dependsOnContexts` (preserve + document)

Checks use demanding lump's **`baseBranch`** on `origin/<that branch>`. Marker must be **`finished`**. Do not load `otherLump` config from another branch in v0.0.9.

## Technical approach

### Phase 1 — Config and helpers

| Item | Location |
| --- | --- |
| `discoveryBranch?`, `discoveryBranches?` in `LocalConfig` | `types/LocalConfig.ts`, `schemas/localConfig.schema.json` |
| Parse validation | `readLocalConfig/main.ts` |
| `resolveDiscoveryBranches`, `resolvePrimaryDiscoveryBranch` | `utils/resolveDiscoveryBranches/` |
| `resolveLumpDiscoveryBranch`, `resolveLumpBaseBranch` | new util or inline |
| `validateLumpDiscoveryBranchAllowlist` | dedicated-mode guard |
| `discoveryBranch?` on lump | `LumpJsConfig`, `lumpConfig.schema.json`, cli-types |

### Phase 2 — Pre-flight and workspace

| Item | Location |
| --- | --- |
| `targetBranch` on `runProjectPreflight` | `runProjectPreflight/main.ts` |
| Lump `resolvedBaseBranch` into `makeLumpWorkspaceFns` | `makeLumpWorkspaceFns/main.ts`, `jsConfigToRunLumpInput/main.ts` |

### Phase 3 — Commands

| Item | Location |
| --- | --- |
| `run` — allowlist (dedicated) + pre-flight to `resolvedBaseBranch` | `commands/run/main.ts` |
| Allowlist in `runLumpFromJsConfig`, `planLumpFromJsConfig` | dedicated only |
| Allowlist in `lump-plan`, `lump-status` | dedicated only |
| Daemon launch + discovery-branch tick loop | `commands/start/main.ts` + extracted helpers |
| `clean` without pre-flight | `commands/clean/main.ts` |

### Phase 4 — Docs and AGENTS.md

Apply [Docs updates](#docs-updates) after behavior is implemented.

## Acceptance criteria

1. **Effective list** — Non-empty `discoveryBranches` wins; singular-only installs behave as today; array-only accepted.
2. **Parse validation** — Empty array, duplicates, neither field rejected; array-only accepted.
3. **Dedicated allowlist** — `run`, `lump-plan`, `lump-status`, daemon fail when `discoveryBranch` not listed; shared mode has no allowlist.
4. **Manual `run`** — Pre-flight to `resolvedBaseBranch`; config from current checkout only.
5. **Dedicated daemon** — Same-branch duplicate lumpName fails launch; cross-branch same name allowed; tick loops discovery branches; bad lump does not stop daemon.
6. **`start --lumpName`** — Config from current checkout; dedicated validates listed `discoveryBranch`; tick uses `resolvedBaseBranch`.
7. **Shared mode** — Discovery from source; copy pre-flights to lump `baseBranch`; multi-`discoveryBranches` logs warning; no allowlist.
8. **Workspace teardown** — Returns to lump `resolvedBaseBranch`.
9. **`clean`** — No pre-flight; cleans remote, local, and shared copy.
10. **Docs + schemas** — User-facing DOCS and schemas updated; `project.json` `projectBaseBranch` retained as legacy fallback.
11. **Cross-lump warning** — Logged at daemon launch when deps span mismatched lump `baseBranch` values.

## Open questions and risks

| # | Risk | Mitigation |
| --- | --- | --- |
| 1 | Long daemon ticks (N discovery branches × M lumps × 2 pre-flights) | Document throughput; Croner `{ protect: true }` serializes ticks |
| 2 | Launch scan cost | Accept for v0.0.9; log duration |
| 3 | `clean` without knowing current branch | Branch list patterns; no checkout switch |
| 4 | Shared discovery stale vs copy | Document operator workflow; by design |
| 5 | Same lumpName on two lines | Allowed; document `start --lumpName` uses current checkout |
