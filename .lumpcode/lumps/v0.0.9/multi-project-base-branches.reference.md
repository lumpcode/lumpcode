# Multi discovery branches — problem statement and adopted design (v0.0.9)

Reference for implementing discovery-branch-aware lump inventory, daemon scheduling, and dependency rules. Captures decisions from design discussion (2026); target release planning lives under `.lumpcode/lumps/v0.0.9/`.

---

## Problems

### 1. Context discovery does not run on the lump's discovery line (dedicated mode)

Today, before a lump executes:

- Pre-flight resets the **execution workspace** to a single branch from `.lumpcode/local.json`.
- `getToDoContextList` reads the **source** `projectRoot` filesystem before `setupWorkspaceFn` switches to the lump's integration branch.
- Lump config and `TODO.yaml` on a release line (`ver/0.0.9`) are invisible when the checkout stayed on `main`.

**Shared mode is different by design** — see [Shared mode: execution vs discovery](#shared-mode-execution-vs-discovery).

### 2. Dedicated continuous runners cannot discover branch-local lumps

Lump inventory is `readdir` under `.lumpcode/lumps/` on the **current checkout**. A machine pinned to `main` never sees lumps that exist only on `ver/0.0.9`.

### 3. `baseBranch` mixed execution and discovery

Lump **`baseBranch`** was used both for git integration (markers, pre-flight, worktrees) and implicitly for "which line this lump belongs to." Operators need two concepts:

| Concept | Lump field | Purpose |
| --- | --- | --- |
| **Execution / git integration** | `baseBranch` | Pre-flight target for run, marker commits, `finished` on `origin/<baseBranch>`, worktree base |
| **Discovery / inventory** | `discoveryBranch` | Which integration line holds this lump's folder for daemon scan and dedicated discovery |

---

## Adopted solution (v0.0.9 scope)

### `discoveryBranch` and `discoveryBranches` in `local.json`

Replaces **`projectBaseBranch` / `projectBaseBranches`** in **`local.json`** only. **`project.json` keeps `projectBaseBranch`** as the legacy tail of lump **`baseBranch`** fallback (last priority).

**Effective discovery list:**

```text
effectiveDiscoveryBranches =
  discoveryBranches non-empty ? discoveryBranches : [discoveryBranch]

primaryDiscoveryBranch = effectiveDiscoveryBranches[0]
```

When **`discoveryBranches` is non-empty**, it **wins** over singular `discoveryBranch` (do not merge arrays).

**Parse validation:**

- Require at least one of `discoveryBranch` or non-empty `discoveryBranches`.
- Reject empty `discoveryBranches` array and duplicate branch names.
- Branch existence on `origin` is **not** checked at parse — pre-flight fails lazily.

Multi-branch example:

```json
{
  "mode": "dedicated",
  "discoveryBranches": ["main", "ver/0.0.9"],
  "workspaceStrategy": "checkout"
}
```

Single-branch example:

```json
{
  "mode": "dedicated",
  "discoveryBranch": "main"
}
```

Effective list: `["main"]`.

**Meaning:** `effectiveDiscoveryBranches` is the allowlist for lump **`discoveryBranch`** in dedicated mode and the discovery-branch loop for dedicated daemons.

### Lump config: `baseBranch` and `discoveryBranch`

**Resolution:**

```text
resolvedDiscoveryBranch = lump.discoveryBranch ?? primaryDiscoveryBranch

resolvedBaseBranch =
  lump.baseBranch
  ?? lump.discoveryBranch
  ?? primaryDiscoveryBranch
  ?? project.json projectBaseBranch
```

- Omitted **`baseBranch`** → execution defaults to discovery line (then primary, then legacy `project.json`).
- **`discoveryBranch`** optional; defaults to `primaryDiscoveryBranch`.
- **`baseBranch` is not allowlisted** — may differ from `discoveryBranch` (e.g. discover on `main`, execute on `ver/0.0.9`).

### Dedicated allowlist

When `mode` is **`dedicated`**, **`resolvedDiscoveryBranch` must be in `effectiveDiscoveryBranches`** for:

- `lumpcode run`
- `lump-plan`
- `lump-status`
- Daemon launch and tick (skip or fail with clear message)

**Shared mode:** no allowlist on any command; lump **`discoveryBranch` is ignored** for validation and scheduling.

### Pre-flight: no change to the core primitive

Keep `pullProjectBaseBranch` / `runPreflight` as they are. **What changes:** callers, target branch, and when.

| Caller | Behavior |
| --- | --- |
| Manual `lumpcode run` | Config from current checkout; dedicated allowlist; pre-flight to **`resolvedBaseBranch`** |
| Dedicated daemon tick | Loop discovery branches → pre-flight to discovery branch → discover → pre-flight each lump to **`resolvedBaseBranch`** → run |
| Shared mode | Copy pre-flight to lump **`resolvedBaseBranch`**; discovery reads **source** |
| `lump-plan` / `lump-status` | Non-destructive; dedicated allowlist only; no pre-flight |
| `lumpcode clean` | No pre-flight |

In **dedicated** mode, after pre-flight to the discovery branch, filesystem discovery aligns with that line. Each lump run pre-flights again to **`resolvedBaseBranch`** when it differs.

Workspace teardown (`makeLumpWorkspaceFns`) switches back to lump **`resolvedBaseBranch`**, not `primaryDiscoveryBranch` when they differ.

---

## Shared mode: execution vs discovery

Lumpcode does **not** perform branch-aware discovery in shared mode:

| Concern | Workspace | Branch |
| --- | --- | --- |
| **Execution** | Copy under `~/.lumpcode/project-copies/<projectName>/` | Pre-flight to lump **`resolvedBaseBranch`** |
| **Discovery** | **Source** `projectRoot` | Whatever **you** have checked out |

- **You manage discovery** on source (e.g. `git switch ver/0.0.9` before running a release-line lump).
- **Edit locally, run without pushing** — discovery sees source; execution uses the copy at the lump's integration branch.
- **`discoveryBranch` on lump config is ignored** in shared mode.
- **No allowlist** in shared mode.
- If `effectiveDiscoveryBranches.length > 1`: log **info/warning** at daemon start that multi-discovery is **dedicated-only**; use **`primaryDiscoveryBranch`** where a single primary is needed.

Multi-branch daemon discovery loop is **dedicated-only**.

---

## Dedicated daemon: discovery-branch-ordered tick

No LRU or per-branch scheduling meta in v0.0.9.

### Launch-time validation (fail immediately)

1. Resolve effective discovery list.
2. **Global daemon:** for each branch in list order, pre-flight once, discover lumps, resolve `discoveryBranch` / `baseBranch`.
3. Fail launch if:
   - **Same discovery-branch scan:** duplicate `lumpName` (two lumps same name visible on one checkout after pre-flight to that branch).
   - Unlisted **`discoveryBranch`**.
   - Unloadable config.
4. **Do not fail** for the same `lumpName` on **different** discovery branches (e.g. lump `A` on `main` with `discoveryBranch: main` and lump `A` on `ver/0.0.9` with `discoveryBranch: ver/0.0.9`).
5. Optional **warning** when a lump's `discoveryBranch` ≠ the branch currently being scanned.
6. **Warnings** for cross-lump **`baseBranch`** mismatch on `dependsOnContexts`.

**Per-lump daemon (`start --lumpName`):**

- Load that lump's config from the **current checkout** (document: operator must be on the intended line).
- Dedicated: verify `resolvedDiscoveryBranch` in effective list.
- No requirement to scan all discovery branches at launch for a single lump.

### Each daemon tick

**Global daemon (dedicated):**

For each branch in **`effectiveDiscoveryBranches`**, **in array order**:

1. Pre-flight execution workspace to that **discovery** branch (reset before discover).
2. `discoverLoadableLumpNames`; for each lump where **`resolvedDiscoveryBranch ===`** current branch.
3. For each eligible lump (not disabled): pre-flight to **`resolvedBaseBranch`**, then `runLumpFromJsConfig` with `lockMode: 'wait'`.
4. On lump failure: log, continue.

**Per-lump daemon (`start --lumpName`):**

- Each tick: pre-flight to lump **`resolvedBaseBranch`**; run that lump only.

**Shared mode daemon:**

- Log once if multi-`discoveryBranches` configured.
- Discover from source; run all eligible lumps; pre-flight copy per **`resolvedBaseBranch`**.

**Throughput note:** each discovery branch may pre-flight once per tick, plus one pre-flight per lump to `resolvedBaseBranch` when it differs. Document wall-time implications.

---

## Manual `lumpcode run`

1. `getJsConfigFromLumpName` from **current checkout** — fail if lump folder/config not present locally.
2. Dedicated: validate **`resolvedDiscoveryBranch`** against effective list.
3. Pre-flight execution workspace to **`resolvedBaseBranch`**.
4. Discovery + run (dedicated: discovery aligns after pre-flight to discovery line when checkout matches; shared: discovery reads source).

---

## `lump-plan` and `lump-status`

- **Non-destructive** — no pre-flight.
- **Dedicated:** validate **`discoveryBranch`** allowlist (same rule as `run`).
- **Shared:** no allowlist.

---

## `lumpcode clean`

No pre-flight. Delete lump branches on remote, local checkout, shared copy, and worktrees. Do not switch branches.

---

## `dependsOnContexts` (v1 rules)

Remote is the source of truth. Checks use demanding lump's **`baseBranch`** on `origin/<that branch>`. Marker must be **`finished`**.

Cross-lump dependency on `otherLump/ctx` → marker on **`origin/<lump A's baseBranch>`**, not B's branch and not discovery branch.

### Cross-lump `baseBranch` mismatch warning (v0.0.9)

At daemon launch (when both lumps visible on same discovery scan), if `dependsOnContexts` references `otherLump/ctx` and `otherLump.baseBranch !== thisLump.baseBranch`, emit a **warning**. Do not hard-fail unless other launch rules fail.

---

## Related issues (not primary scope)

| Topic | Note |
| --- | --- |
| Double `getToDoContextList` per run | Separate follow-up |
| `GetContextListFnInput` | No `baseBranch` in v0.0.9 |
| Shared discovery from copy | Deliberately not done |
| `allowUnlistedBaseBranch` | **Removed** — use `discoveryBranch` / `baseBranch` |
| Docs / schema | `discoveryBranch(s)` in local + lump config |

---

## Implementation checklist

- [ ] `LocalConfig`: `discoveryBranch` / `discoveryBranches`; helpers `resolveDiscoveryBranches`, `resolvePrimaryDiscoveryBranch`; parse validation
- [ ] Lump `discoveryBranch` on config + schema; `resolveLumpDiscoveryBranch`, `resolveLumpBaseBranch`
- [ ] `validateLumpDiscoveryBranchAllowlist` — **dedicated mode only**
- [ ] Dedicated daemon launch: same-branch duplicate lumpName fail; unlisted discoveryBranch fail; optional misalignment warning
- [ ] Dedicated daemon tick: loop discovery branches → discover → pre-flight to `resolvedBaseBranch` → run
- [ ] Per-lump daemon: current checkout config; dedicated allowlist; tick to `resolvedBaseBranch`
- [ ] `run`, `lump-plan`, `lump-status`: dedicated allowlist; shared skips allowlist
- [ ] Shared daemon: multi-`discoveryBranches` warning; ignore lump `discoveryBranch`
- [ ] `makeLumpWorkspaceFns`: teardown uses `resolvedBaseBranch`
- [ ] `clean`: no pre-flight
- [ ] Cross-lump `baseBranch` mismatch warning at launch
- [ ] User DOCS + AGENTS.md
- [ ] E2E: dedicated second discovery branch; branch order; same-branch duplicate fail; cross-branch same name OK; unlisted discoveryBranch fail; clean without pre-flight

---

## Summary sentence

**`discoveryBranch(s)` in `local.json` declares which integration lines a dedicated installation may scan; each lump may set `discoveryBranch` (inventory) and `baseBranch` (git execution) separately; dedicated daemons loop discovery branches each tick, discover matching lumps, pre-flight to each lump's execution branch, and run; shared mode discovers from source with no allowlist and ignores lump `discoveryBranch`; cross-lump dependencies remain satisfied only when the upstream marker is finished on the demanding lump's `baseBranch`.**
