# Multi `projectBaseBranches` — problem statement and adopted design (v0.0.9)

Reference for implementing integration-branch-aware lump discovery, daemon scheduling, and dependency rules. Captures decisions from design discussion (2026); target release planning lives under `.lumpcode/lumps/v0.0.9/`.

---

## Problems

### 1. Context discovery does not run on the lump integration branch (dedicated mode)

Today, before a lump executes:

- Pre-flight resets the **execution workspace** to a single `projectBaseBranch` from `.lumpcode/local.json`.
- `getToDoContextList` (and thus `getContextListFn`) reads the **source** `projectRoot` filesystem and runs `getContextStatus` with `cwd: projectRoot`.
- There is **no** `git switch` to the lump's `baseBranch` until `setupWorkspaceFn` inside `executeStepsForContextList` — after context discovery has already run twice (`resolveBranchWorkspacePathForLumpRun` and `runLump`).

For lumps with `baseBranch` different from `local.json` `projectBaseBranch` (e.g. `v0.0.7` on `ver/0.0.7`), discovery can read the wrong tree on a **dedicated** machine: `TODO.yaml`, PRD/test-plan existence checks, and file scans reflect whatever branch the checkout was on before pre-flight targeted the wrong branch.

**Shared mode is different by design** — see [Shared mode: execution vs discovery](#shared-mode-execution-vs-discovery).

### 2. Dedicated continuous runners cannot discover branch-local lumps

Lump inventory is `readdir` under `.lumpcode/lumps/` on the **current checkout** (`discoverLoadableLumpNames`). A machine pinned to `main` never sees lumps that exist only on `ver/0.0.7`. Release-line lumps added on integration branches stay invisible until someone manually switches branch and pulls.

### 3. Cross-lump dependencies across different integration branches (deferred)

If lump A on `ver/0.0.7` depends on lump B, resolving B's `baseBranch` for status checks requires B's config. On A's branch, `.lumpcode/lumps/B/` may not exist. General cross-`baseBranch` cross-lump dependency resolution needs cross-branch lump metadata (registry, `git show`, etc.) — out of scope for v1.

---

## Adopted solution (v0.0.9 scope)

### `projectBaseBranch` and `projectBaseBranches` in `local.json`

Single-branch installs keep using **`projectBaseBranch`**. Multi-branch installs may set **`projectBaseBranches`** alone or together with the singular field.

**Resolution (effective allowlist):**

1. If `projectBaseBranches` is present → use it (non-empty `string[]`).
2. Else → use `[projectBaseBranch]` from the singular field.

**Primary branch** (single value for defaults such as lump `baseBranch` fallback and default pre-flight target): `projectBaseBranch` when set, else the **first element** of `projectBaseBranches`.

Do not require projects to migrate to the array form. Single-branch installs continue to scaffold and edit only `projectBaseBranch`.

**Validation at parse:**

- Require **at least one** of `projectBaseBranch` or non-empty `projectBaseBranches`.
- Reject an empty `projectBaseBranches` array.
- Reject duplicate branch names in `projectBaseBranches`.
- Branch existence on `origin` is **not** checked at parse — pre-flight fails lazily with a clear error if a listed branch is missing.

Multi-branch example (array only):

```json
{
  "mode": "dedicated",
  "projectBaseBranches": ["main", "ver/0.0.7"],
  "workspaceStrategy": "checkout"
}
```

Multi-branch example (both fields):

```json
{
  "mode": "dedicated",
  "projectBaseBranch": "main",
  "projectBaseBranches": ["main", "ver/0.0.7"],
  "workspaceStrategy": "checkout"
}
```

When both are set, **`projectBaseBranches` wins** for the effective list; `projectBaseBranch` may remain for backward compatibility or as an explicit primary override when set, but runtime logic must not merge the two arrays.

Single-branch example (unchanged from today):

```json
{
  "mode": "dedicated",
  "projectBaseBranch": "main"
}
```

Effective list: `["main"]`.

**Meaning:** the resolved list is the official integration branches this project installation may operate on — allowlist and (in dedicated mode) discovery scope for lumps.

### Lump `baseBranch` must be listed (with legacy opt-out)

- Every lump's resolved `baseBranch` (`config.baseBranch ?? primary integration branch` — `projectBaseBranch` when set, else first `projectBaseBranches` element) must be **included in** the effective integration-branch list (from `projectBaseBranches` if set, else `[projectBaseBranch]`).
- If not listed → **fail at run start** (manual `run`, `lump-plan` validate) or **fail at daemon launch** (see below) with a clear error.
- **Opt-out:** `allowUnlistedBaseBranch: true` on the lump config restores **legacy behavior**: no validation against the effective integration-branch list.

Apply this rule in **both** `shared` and `dedicated` mode.

### Pre-flight: no change to the core primitive

Keep `pullProjectBaseBranch` / `runPreflight` as they are: `git fetch --all`, `git switch <branch>`, `git reset --hard origin/<branch>`, `git pull origin <branch>` at the execution workspace.

**What changes:** **who calls it, with which branch, and when** — not the pre-flight implementation itself.

| Caller | Behavior |
|--------|----------|
| Manual `lumpcode run` | Load lump config from **current checkout** (fail if not found); validate allowlist; pre-flight execution workspace to the **lump's** `baseBranch`; then discovery + run |
| Dedicated daemon tick | Branch-ordered loop — see [Dedicated daemon](#dedicated-daemon-branch-ordered-tick) |
| Shared mode | Pre-flight on the **copy** targets the lump's `baseBranch` for execution; discovery reads **source** — see below |
| `lump-plan` / `lump-status` | **Non-destructive** — no pre-flight; discovery reads current checkout |
| `lumpcode clean` | **No pre-flight** — delete lump branches on remote, local checkout, and shared copies |

In **dedicated** mode, once the checkout is on the lump's `baseBranch`, `projectRoot` equals the execution workspace — filesystem discovery and `getContextListFn` align with the integration branch without changing `getToDoContextList` internals.

Workspace teardown (`makeLumpWorkspaceFns`) must switch back to the **lump's resolved `baseBranch`** (the branch pre-flighted for this run), not the primary integration branch from `local.json` when they differ.

---

## Shared mode: execution vs discovery

In **shared** mode, Lumpcode deliberately splits where work happens:

| Concern | Workspace | Branch |
|---------|-----------|--------|
| **Execution** (agent, git commits, lump branches) | Copy under `~/.lumpcode/project-copies/<projectName>/` | Pre-flight resets copy to lump's `baseBranch` |
| **Discovery** (`getContextListFn`, file scans, `TODO.yaml`, PRD checks) | **Source** `projectRoot` (day-to-day clone) | Whatever **you** have checked out locally |

This is **intentional**, not a bug to fix in v0.0.9:

- **You manage discovery.** Keep your source checkout aligned with the lump you intend to run, or accept that context lists and file scans reflect your local tree.
- **Edit locally, run without pushing.** You can modify a lump config or context sources on source and run immediately — discovery sees your uncommitted changes while execution happens on the synced copy at the lump's integration branch. This is a primary shared-mode workflow.

Operational expectations to document in user-facing DOCS:

- Match source branch to the lump's integration line when you care about branch-accurate discovery (e.g. `git switch ver/0.0.7` before running a lump on that line).
- `getContextStatus` still uses remote refs (`origin/<lump baseBranch>`); local checkout does not gate `finished` / `branchPushed`.
- Multi-branch daemon discovery is **dedicated-only**; shared-mode daemons discover lumps from whatever is on source at tick time.

---

## Dedicated daemon: branch-ordered tick

No LRU or per-branch scheduling meta in v0.0.9. Single-branch and multi-branch projects use the **same tick shape**.

### Launch-time validation (fail immediately)

Before the scheduler starts (detached or foreground), validate configuration and **do not start** the daemon on failure:

1. Resolve effective branch list; fail if empty or invalid.
2. **Global daemon (dedicated):** for each branch in list order, pre-flight once and build registry of `(lumpName, baseBranch)` pairs.
3. Fail launch if:
   - The same `lumpName` appears on more than one integration branch (ambiguous; cannot safely ignore).
   - Any lump's resolved `baseBranch` is not in the effective list (without `allowUnlistedBaseBranch`).
   - Required lump config cannot be loaded during this scan.
4. Surface all errors in one response so the operator can fix config before retrying.

**Per-lump daemon (`start --lumpName`):** load that lump's config from the current checkout; verify its `baseBranch` is in the effective list; fail launch if not. No multi-branch discovery scan at launch.

### Each daemon tick

**Global daemon (dedicated mode):**

1. For each branch in the effective list, **in array order**:
   - Pre-flight execution workspace to that branch.
   - `discoverLoadableLumpNames`; for each lump, resolve `baseBranch`.
   - Run **every** eligible lump on that branch, one after another (same sequential loop as today within a branch).
2. Skip individual lumps at tick time when possible (log, continue): disabled, config load error, run failure. Do not crash the daemon for one bad lump.

**Per-lump daemon (`start --lumpName`):**

- Each tick: pre-flight to the lump's `baseBranch` (already validated at launch); run that one lump only.

**Shared mode daemon:**

- No multi-branch scan. One pre-flight per tick (to primary integration branch or lump branch as resolved for the run path); discover lumps from source; run all eligible lumps sequentially — same inner loop, effective list length 1 for discovery purposes.

**Throughput note:** one tick runs all lumps on branch 1, then all on branch 2, etc. A 5-minute cron with 3 branches and 2 lumps each may run up to 6 lump executions per tick (plus 3 pre-flights). Document wall-time implications; refine later (parallel worktrees, todo-weighted ordering, etc.) if needed.

---

## Manual `lumpcode run`

1. `getJsConfigFromLumpName` from **current checkout** — **fail** with a clear message if the lump folder/config is not present locally (no cross-branch config scan).
2. Validate resolved `baseBranch` against effective list (unless `allowUnlistedBaseBranch`).
3. Pre-flight execution workspace to lump's `baseBranch`.
4. Discovery + run (dedicated: discovery aligns with integration branch; shared: discovery reads source — see above).

---

## `lumpcode clean`

No pre-flight (no fetch/switch/reset/pull).

Delete lump branches (`lump/<lumpName>/*` pattern, respecting `--lumpName` / `--contextName` scope):

- On **remote** (`git push --delete origin …`).
- On **local** source checkout (and worktrees under `.lumpcode/worktrees/`).
- On **shared copy** at `~/.lumpcode/project-copies/<projectName>/` when it exists.

Use `git fetch --all` where needed before remote delete only; do not switch branches.

---

## `dependsOnContexts` (v1 rules)

Remote is the source of truth (`git fetch`, remote log, `merge-base` against `origin/<branch>`). Local checkout state does not gate dependency satisfaction.

### Same-lump dependency

Context X depends on context Y in the same lump → look for Y's marker commit on **`origin/<this lump's baseBranch>`**. Must be **`finished`** (marker is ancestor of that ref). `branchPushed` does **not** satisfy.

### Cross-lump dependency (`otherLump/contextName`)

Context on lump A depends on `otherLump/ctx` → look for marker `LUMP:otherLump - ctx` on **`origin/<lump A's baseBranch>`** (the **demanding** lump's integration branch).

- If the marker is not found or not finished on that ref → dependency **not satisfied**.
- **Do not** load `otherLump` config or use B's `baseBranch` for the check in v1.

**Rationale:** when the runner is on A's branch, B's lump folder may be absent — resolving B's `baseBranch` is awkward. We do not expect cross-lump dependencies that span different integration branches in practice; upstream work must be merged into **A's line** (marker visible on A's `baseBranch`).

**Out of scope v1:** cross-integration-branch cross-lump dependencies (e.g. A on `ver/0.0.7` waiting for a marker that exists only on `main`). Failure mode if misconfigured: context never becomes eligible (document clearly).

### Cross-lump `baseBranch` mismatch warning (v0.0.9)

At daemon launch registry build (when both lumps are visible on the same branch), if a context has `dependsOnContexts` referencing `otherLump/ctx` and `otherLump.baseBranch !== thisLump.baseBranch`, emit a **warning** (daemon log / operator-visible). Do not hard-fail unless launch rules above already fail for other reasons.

This matches current engine behavior (single `baseBranch` passed to all `getContextStatus` calls in `getToDoContextList`); v0.0.9 **documents and preserves** it while adding multi-branch discovery in dedicated mode.

---

## Related issues (not primary scope of this doc)

| Topic | Note |
|-------|------|
| Double `getToDoContextList` per run | Lock resolution + `runLump` each call discovery; consider caching todo list between phases in a separate change |
| `GetContextListFnInput` | Still `{ codeBasePaths, lumpVariables }` only; no `baseBranch` in v0.0.9 |
| Shared discovery from copy | Deliberately not done — see [Shared mode: execution vs discovery](#shared-mode-execution-vs-discovery) |
| Docs / schema | Update `LocalConfig`, `lump-config.md`, `local-config.md`, daemon + clean behavior; CLI validation for effective list + `allowUnlistedBaseBranch` |

---

## Implementation checklist (high level)

- [ ] `LocalConfig`: optional `projectBaseBranch` when non-empty `projectBaseBranches` is set; add optional `projectBaseBranches`; helpers `resolveProjectBaseBranches(localConfig)` — array wins when present, else `[projectBaseBranch]` — and `resolvePrimaryProjectBaseBranch(localConfig)` — singular when set, else first array element; reject empty array, duplicates, and configs with neither field
- [ ] `allowUnlistedBaseBranch` on lump config + schema
- [ ] Validate lump `baseBranch` is in the effective list unless opt-out
- [ ] Dedicated daemon launch: full branch scan + fail fast on duplicate lump names, unlisted base branches, unloadable configs
- [ ] Dedicated daemon tick: loop branches in order → pre-flight → run all lumps on each branch sequentially
- [ ] Per-lump daemon: verify `baseBranch` in list at launch; tick pre-flights to lump branch only
- [ ] Manual `run`: config from current checkout only; pre-flight to lump `baseBranch`
- [ ] `makeLumpWorkspaceFns`: teardown/switch-back uses lump resolved `baseBranch`
- [ ] `clean`: no pre-flight; remote + local + shared copy lump branch deletion
- [ ] Cross-lump `baseBranch` mismatch warning at launch registry build
- [ ] Document shared vs dedicated discovery (including local-edit-without-push workflow)
- [ ] Document cross-lump dep rule (demanding lump's `baseBranch` only)
- [ ] E2E: dedicated discovers lump on second listed branch; branch order in one tick; launch fail on duplicate lump name; validation fail for unlisted `baseBranch`; clean without pre-flight

---

## Summary sentence

**The effective integration-branch list (`projectBaseBranches` if set, else `[projectBaseBranch]`) declares which lines a machine may touch; lumps anchor to one of those lines; dedicated daemons validate at launch, then each tick pre-flights each listed branch in order and runs every lump on that branch; shared mode runs on the copy but discovers from source so you can edit lumps locally without pushing; cross-lump dependencies are satisfied only when the upstream marker is finished on the demanding lump's `baseBranch`.**
