# Multi `projectBaseBranches` — problem statement and adopted design (v0.0.8)

Reference for implementing integration-branch-aware lump discovery, daemon scheduling, and dependency rules. Captures decisions from design discussion (2026); target release planning lives under `.lumpcode/lumps/v0.0.8/`.

---

## Problems

### 1. Context discovery does not run on the lump integration branch

Today, before a lump executes:

- Pre-flight resets the **execution workspace** to a single `projectBaseBranch` from `.lumpcode/local.json`.
- `getToDoContextList` (and thus `getContextListFn`) reads the **source** `projectRoot` filesystem and runs `getContextStatus` with `cwd: projectRoot`.
- There is **no** `git switch` to the lump's `baseBranch` until `setupWorkspaceFn` inside `executeStepsForContextList` — after context discovery has already run twice (`resolveBranchWorkspacePathForLumpRun` and `runLump`).

For lumps with `baseBranch` different from `local.json` `projectBaseBranch` (e.g. `v0.0.7` on `ver/0.0.7`), discovery can read the wrong tree: `TODO.yaml`, PRD/test-plan existence checks, and file scans reflect whatever is checked out on source (shared mode: source is never touched by pre-flight).

### 2. Dedicated continuous runners cannot discover branch-local lumps

Lump inventory is `readdir` under `.lumpcode/lumps/` on the **current checkout** (`discoverLoadableLumpNames`). A machine pinned to `main` never sees lumps that exist only on `ver/0.0.7`. Release-line lumps added on integration branches stay invisible until someone manually switches branch and pulls.

### 3. Cross-lump dependencies across different integration branches (deferred)

If lump A on `ver/0.0.7` depends on lump B, resolving B's `baseBranch` for status checks requires B's config. On A's branch, `.lumpcode/lumps/B/` may not exist. General cross-`baseBranch` cross-lump dependency resolution needs cross-branch lump metadata (registry, `git show`, etc.) — out of scope for v1.

---

## Adopted solution (v0.0.8 scope)

### `projectBaseBranch` and `projectBaseBranches` in `local.json`

Keep **both** fields. Many projects only have one integration branch and should keep using the existing singular field.

**Resolution (effective allowlist):**

1. If `projectBaseBranches` is present → use it (non-empty `string[]`).
2. Else → use `[projectBaseBranch]` from the existing singular field.

Do not require projects to migrate to the array form. Single-branch installs continue to scaffold and edit only `projectBaseBranch`.

Multi-branch example:

```json
{
  "mode": "dedicated",
  "projectBaseBranch": "main",
  "projectBaseBranches": ["main", "ver/0.0.7"],
  "workspaceStrategy": "checkout"
}
```

When both are set, **`projectBaseBranches` wins** for the effective list; `projectBaseBranch` may remain for backward compatibility or as a default hint in tooling, but runtime logic must not merge the two arrays.

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

- Every lump's resolved `baseBranch` (`config.baseBranch ?? fallback`) must be **included in** the effective integration-branch list (from `projectBaseBranches` if set, else `[projectBaseBranch]`).
- If not listed → **fail at config load / run start** with a clear error.
- **Opt-out:** a lump-specific flag (name TBD, e.g. `allowUnlistedBaseBranch: true`) restores **legacy behavior**: no validation against the effective integration-branch list; discovery and run follow today's semantics.

Apply this rule in **both** `shared` and `dedicated` mode (no need to disable it for shared).

### Pre-flight: no change to the core primitive

Keep `pullProjectBaseBranch` / `runPreflight` as they are: `git fetch --all`, `git switch <branch>`, `git reset --hard origin/<branch>`, `git pull origin <branch>` at the execution workspace.

**What changes:** **who calls it, with which branch, and when** — not the pre-flight implementation itself.

| Caller | Behavior |
|--------|----------|
| Manual `lumpcode run` | Pre-flight (or equivalent) to the **lump's** `baseBranch` before discovery + run, when that branch is listed |
| Dedicated daemon tick | See discovery + LRU below |
| Shared mode | User pulls source themselves; pre-flight on the **copy** still targets the lump's `baseBranch` for the run (same primitive, branch argument from lump) |

In **dedicated** mode, once the checkout is on the lump's `baseBranch`, `projectRoot` equals the execution workspace — filesystem discovery and `getContextListFn` align with the integration branch without changing `getToDoContextList` internals.

In **shared** mode, filesystem discovery still reads **source** `projectRoot`; users keep source reasonably aligned with the lump they run (document as operational expectation).

---

## Dedicated daemon: discovery + LRU scheduling

Each daemon tick (dedicated mode only for multi-branch **discovery**):

1. **Scan all effective integration branches** — for each entry in the resolved list (`projectBaseBranches` if set, else `[projectBaseBranch]`), run pre-flight reset to that branch on the execution workspace, then `discoverLoadableLumpNames` (and read each lump's `baseBranch` from config).
2. **Merge registry** — accumulate `(lumpName, baseBranch)` pairs seen across branches (same name on different branches should not happen in practice; define fail-or-last-wins if it does).
3. **Pick one `projectBaseBranch`** — **LRU**: choose the listed branch that was picked least recently for a run (persist `lastRunAt` per branch in daemon meta; survives restart).
4. **Pre-flight to chosen branch** (may already be there from step 1).
5. **Run one lump** — among lumps whose `baseBranch` equals the chosen branch and pass validation; lump selection within the branch (priority / todo order) can be v1-simple: first eligible todo context's lump or round-robin later.

**Throughput note:** one lump per tick per LRU branch rotation — e.g. three branches and a 5-minute cron ≈ one run per branch every 15 minutes. Document; refine scheduling later (todo-weighted branch pick, parallel worktrees, etc.).

**Shared mode:** no automatic multi-branch discovery loop. User pulls source; new lumps appear when their checkout includes them. The effective integration-branch allowlist still applies at run time.

**Single-branch projects:** when only `projectBaseBranch` is set, daemon behavior matches today (one branch in the list); no need to add `projectBaseBranches`.

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

**Optional follow-up (not v1):** at config load, when both lumps are visible on the same branch during discovery, warn or fail if `otherLump.baseBranch !== thisLump.baseBranch` for a cross-lump dep.

This matches current engine behavior (single `baseBranch` passed to all `getContextStatus` calls in `getToDoContextList`); v0.0.8 mainly **documents and preserves** it while adding multi-branch discovery elsewhere.

---

## Related issues (not primary scope of this doc)

| Topic | Note |
|-------|------|
| Double `getToDoContextList` per run | Lock resolution + `runLump` each call discovery; consider caching todo list between phases in a separate change |
| `GetContextListFnInput` | Still `{ codeBasePaths, lumpVariables }` only; no `baseBranch` in v0.0.8 |
| Cross-mode parity | Shared relies on user pull; dedicated relies on per-tick branch scan |
| Docs / schema | Update `LocalConfig` (keep `projectBaseBranch`; add optional `projectBaseBranches`; document precedence), `lump-config.md`, `local-config.md`, daemon behavior; CLI validation for effective list + lump flag |

---

## Implementation checklist (high level)

- [ ] `LocalConfig`: keep `projectBaseBranch`; add optional `projectBaseBranches`; helper `resolveProjectBaseBranches(localConfig)` — array wins when present, else `[projectBaseBranch]`
- [ ] Validate lump `baseBranch` is in the effective list unless opt-out flag set
- [ ] Dedicated daemon: per-tick branch scan → registry → LRU pick → one lump run
- [ ] Daemon meta: `lastRunAt` (or similar) per `projectBaseBranch`
- [ ] Manual `run`: pre-flight to lump `baseBranch` before discovery when listed
- [ ] Document shared vs dedicated discovery contracts
- [ ] Document cross-lump dep rule (demanding lump's `baseBranch` only)
- [ ] E2E: dedicated runner discovers lump on second listed branch; LRU rotation; validation failure for unlisted `baseBranch`

---

## Summary sentence

**The effective integration-branch list (`projectBaseBranches` if set, else `[projectBaseBranch]`) declares which lines a machine may touch; lumps anchor to one of those lines; dedicated daemons discover lumps by scanning each line and run one lump per tick on the LRU branch; cross-lump dependencies are satisfied only when the upstream marker is finished on the demanding lump's `baseBranch`.**
