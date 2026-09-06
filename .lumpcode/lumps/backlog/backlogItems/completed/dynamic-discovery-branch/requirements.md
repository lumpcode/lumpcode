# Requirements: Dynamic discovery branches (globs + multi-line lumps)

| Field | Value |
| --- | --- |
| **Backlog** | `dynamic-discovery-branch` · priority **4** · workflow **[testPlan, testImpl]** |
| **Type** | feature |
| **Packages** | Primary: `packages/apps/cli` (+ `cli-types` / `cli-utils` author types). `@lumpcode/core` **unchanged** (`GetContextListFnInput`, `RunLumpInput.baseBranch: string`). Recipes/tests that invoke author-facing list fns may need call-site updates for the new required `discoveryBranch` param. |

## Problem statement and motivation

Dedicated installs can list several long-lived lines in `local.json` `primaryBranches`, and each lump pins a single exact `discoveryBranch`. That does not scale to short-lived feature integration lines (`feature/a`, `feature/b`, …): operators would have to edit `local.json` (and often lump config) whenever a new feature line appears. The same lump campaign cannot declare “run on `dev` and on every `feature/*` line,” and context authors have no first-class concrete discovery branch when filtering work per feature.

Pain points:

1. `primaryBranches` / lump `discoveryBranch` are exact strings only. No git-glob scan expansion.
2. One lump config cannot be eligible on both an exact line (`dev`) and a family of lines (`feature/*`).
3. Manual `run` / plan / status have no clean story for “this lump’s discovery rule is a pattern.”
4. `baseBranch` cannot be derived from the concrete discovery line and the discovered context list without hard-coding.

## Goals

1. **Glob-capable `primaryBranches`** — dedicated daemon expands git `ls-remote` globs to remote heads each launch/tick; primary = first **exact** entry (globs may appear anywhere); no exact entry → fail.
2. **Lump `discoveryBranch` / `discoveryBranches`** — exact and/or glob rules; lump eligible when the concrete scan branch matches any rule; allowlisted against configured `primaryBranches`.
3. **Concrete discovery for every run** — daemon fan-out per expanded scan branch; manual CLI surfaces use a concrete branch (flag or first exact discovery rule).
4. **Author access to concrete discovery** — CLI `getContextListFn` / `contextMatchFn` receive required `discoveryBranch: string`; CLI binds it before `runLump` (core input shape unchanged).
5. **Resolvable `baseBranch`** — `string | BaseBranchFn | FilePath`; fn sees concrete discovery + **pre-status** raw context list; CLI pre-resolves to a string for core; omit → concrete discovery branch.
6. **Docs/schema** — `local.json`, lump config, concepts branch-resolution, commands (`--discoveryBranch`), `lumpConfig.schema.json` / local schema aligned.

## Non-goals

- Renaming `primaryBranches` / `primaryBranch` to `discoveryBranches` in `local.json`.
- Shared-mode glob fan-out (shared stays single exact primary; lump discovery rules ignored for scheduling as today; `--discoveryBranch` warn-and-ignore).
- Per-`(lumpName, discoveryLine)` concurrent-branch caps (`maximumNumberOfConcurrentBranches` stays global per `lumpName`; document shared cap across lines).
- Changing `@lumpcode/core` `GetContextListFnInput` or making `RunLumpInput.baseBranch` a function.
- Glob/`baseBranch` patterns as checkout refs (patterns are discovery/scan rules only; resolved refs are always concrete).
- Parallel scan-branch execution within a tick (sequential scan loop remains; parallelism is a separate backlog item).

## User stories / use cases

1. **Operator (feature lines)** — `primaryBranches: ["dev", "feature/*"]`. Global dedicated daemon each tick expands remote `feature/*` heads, scans `dev` then each feature line, and runs matching lumps.
2. **Author (multi-line lump)** — Lump has `discoveryBranches: ["dev", "feature/*"]`. On `feature/a`, `getContextListFn` sees `discoveryBranch: "feature/a"` and returns only that feature’s contexts (empty list → early no-op).
3. **Operator (manual feature run)** — `lumpcode run multi --discoveryBranch feature/a` preflights/runs on `feature/a`. `lumpcode run multi` without a flag uses first exact rule (`dev`). Pattern-only lump without a flag fails asking for `--discoveryBranch`.
4. **Author (dynamic base)** — `baseBranch` module fn returns an execution line from `{ effectiveDiscoveryBranch, contexts }` (raw list); status/todo then use that concrete base.
5. **Operator (shared mode)** — Globs in `primaryBranches` do not expand; behavior stays single-primary / operator-managed discovery.

## Proposed behavior and UX

### Glob dialect

- Same rules as **`git ls-remote --heads origin <pattern>`** refname globs (e.g. `feature/*`).
- In-process match for lump eligibility / allowlist / CLI flag checks uses that dialect.
- Exact strings never run through glob matching.
- A value is a **pattern** if it contains glob metacharacters accepted by that dialect (at least `*` and `?`).

### `local.json` — `primaryBranch` / `primaryBranches`

| Rule | Behavior |
| --- | --- |
| Field names | Unchanged (`primaryBranch`, `primaryBranches`). |
| Entry shape | Exact branch name or git-glob pattern. |
| Effective list | Unchanged precedence: non-empty `primaryBranches` else `[primaryBranch]` (existing alias/`projectBaseBranch` behavior preserved). |
| **Primary** | First **exact** entry in the effective list. |
| No exact entry | Fail config validation / daemon launch / run prelude (e.g. `["feature/*"]` or `primaryBranch: "feature/*"`). |
| Expansion (dedicated) | For each glob entry: `git ls-remote --heads origin <pattern>` → branch names; exact entries kept as-is; union, dedupe, stable deterministic order. |
| Empty glob | Log and skip that entry; continue. |
| `ls-remote` error | Fail the expand step (launch/tick/run path that needed expansion). |
| Shared mode | No glob expansion; only the exact primary is used for defaults; multi-entry list keeps today’s warn-once behavior. |

Example:

```json
{
  "mode": "dedicated",
  "primaryBranches": ["dev", "feature/*"]
}
```

Primary = `dev`. Scan set = `dev` ∪ remote heads matching `feature/*`.

### Lump config — discovery rules

`LumpJsConfig` delta:

| Field | Type | Notes |
| --- | --- | --- |
| `discoveryBranch` | `string` | Exact or git-glob. |
| `discoveryBranches` | `string[]` | Each exact or git-glob. |
| Mutual exclusion | — | Setting both `discoveryBranch` and `discoveryBranches` fails validation. |
| Omit both | — | Effective rule = exact primary (concrete). |

**Match:** concrete `scanBranch` / effective discovery matches if it equals an exact rule or matches a pattern rule.

**Allowlist (dedicated):** every configured discovery rule must be allowed against **configured** (unexpanded) `primaryBranches`:

- Exact rule: equals an exact primary entry, **or** matches a primary glob entry’s pattern.
- Pattern rule: equals some `primaryBranches` entry (typically the same glob string).

**Flagless concrete discovery** (`run`, `start --lumpName`, `lump-plan`, `lump-status`):

| Lump discovery rules | No `--discoveryBranch` |
| --- | --- |
| Has ≥1 exact rule | Use **first exact** rule. |
| Pattern-only (singular pattern or all patterns) | **Fail** — require `--discoveryBranch <concrete>`. |

### CLI `--discoveryBranch`

| Rule | Behavior |
| --- | --- |
| Value | Must be **concrete** (reject patterns). |
| Dedicated | Becomes effective discovery / phase-1 preflight target. |
| Allowlist | Covered by `primaryBranches` rules (exact or primary glob match); does not require a prior `ls-remote` hit (missing branch fails at preflight). |
| Lump gate | Must match the lump’s discovery rule(s). |
| Shared | Warn-and-ignore (unchanged). |
| Global `start` (no `--lumpName`) | Flag ignored as today. |

```bash
lumpcode run multi --discoveryBranch feature/a
lumpcode lump-plan multi --discoveryBranch feature/a
lumpcode lump-status multi --discoveryBranch feature/a
```

### Daemon tick / launch (dedicated global)

1. Expand `primaryBranches` → concrete scan set.
2. For each scan branch (existing locked discover/preflight flow): load lumps; keep those whose discovery rules match the scan branch.
3. Run each kept lump with effective discovery = that scan branch.
4. Per-scan duplicate `lumpName` still fails launch; same name on different scan branches OK.
5. Branch/lump failures: log and continue (existing tick resilience).

### `baseBranch`

| Form | Behavior |
| --- | --- |
| Omit | Concrete effective discovery branch. |
| `string` | Must be exact (pattern → fail). |
| `BaseBranchFn` / `FilePath` | CLI resolves before `runLump` (see below). |

```ts
type BaseBranchFnInput = {
  effectiveDiscoveryBranch: string;
  /** Pre-status raw list from the context source (not todo-filtered). */
  contexts: ContextList;
};
type BaseBranchFn = (input: BaseBranchFnInput) => MaybePromise<string>;
```

**CLI resolve order (before `runLump`):**

1. Bind author context source with concrete `discoveryBranch`.
2. Invoke once → raw `contexts` (may be `[]`).
3. If `baseBranch` is a fn/FilePath: call with `{ effectiveDiscoveryBranch, contexts }`; result must be non-empty exact branch name.
4. Pass `baseBranch: string` and a **cache-backed** core `getContextListFn` that returns the same raw list (author source not called twice).
5. Core `getToDoContextList` / status / execution use that string as today.

### Author-facing context fns (CLI / `cli-types` / `cli-utils`)

Core unchanged:

```ts
// @lumpcode/core — no change
GetContextListFnInput: { codeBasePaths; lumpVariables }
```

Author / CLI types gain required concrete `discoveryBranch: string` on:

- `getContextListFn` params (CLI-shaped type used by `LumpJsConfig` / `defineGetContextListFn`)
- `ContextMatchFn` params

At the run boundary, CLI closes over the concrete branch and adapts to the core `GetContextListFn` signature.

### `maximumNumberOfConcurrentBranches`

Unchanged counting: all open `lump/<lumpName>/*` heads share one cap. **Document** that multi-discovery fan-out shares this cap across integration lines.

## Technical approach

| Step | Where | Contract / change |
| --- | --- | --- |
| 1 | Glob helpers (CLI utils; reuse `listRemoteHeadBranches` where fit) | `isGitRefGlob`, `branchMatchesGitGlob`, `expandPrimaryBranches({ localConfig, cwd, … })` → concrete list or Failure |
| 2 | `resolvePrimaryBranches` / primary resolution | Primary = first exact; validate ≥1 exact; shared ignores globs for scan |
| 3 | `validateLumpDiscoveryBranchAllowlist` + discovery rule normalize | Singular/plural mutual exclusion; match + allowlist rules above |
| 4 | `resolveEffectiveDiscoveryBranch` / `run` / `start` / `lump-plan` / `lump-status` | Concrete flag rules; flagless first-exact; pattern-only fail |
| 5 | `discoverDedicatedLumpsForScanBranch` / `validateDaemonLaunch` / daemon tick | Expand then scan; filter lumps by rule match |
| 6 | `LumpJsConfig` + JSON schema | `discoveryBranches`; `baseBranch` string \| fn \| FilePath |
| 7 | `cli-types` / `defineGetContextListFn` / `ContextMatchFn` | Required `discoveryBranch` on author params |
| 8 | `jsConfigToRunLumpInput` (or adjacent bind helper) | Bind discovery; raw list → `baseBranch` fn → cache-backed core list fn + string `baseBranch` |
| 9 | Docs | concepts branch resolution, local-config, lump-config, commands |

**Packages/files (indicative):** `LocalConfig`, `localConfig.schema.json`, `LumpJsConfig`, `lumpConfig.schema.json`, `resolveLumpBranches`, `resolvePrimaryBranches`, `resolveEffectiveDiscoveryBranch`, `validateLumpDiscoveryBranchAllowlist`, `discoverDedicatedLumpsForScanBranch`, `validateDaemonLaunch`, daemon tick, `jsConfigToRunLumpInput`, `cli-types` helpers/types, DOCS under `packages/apps/cli/DOCS/`.

## Testing strategy

| Level | Coverage |
| --- | --- |
| Unit | Glob detect/match; expand empty/error/dedupe; primary = first exact / fail all-glob; discovery singular↔plural exclusion; allowlist exact-via-primary-glob and pattern-entry equality; flag concrete-only + lump match; flagless first-exact vs pattern-only fail; `baseBranch` fn with raw list + cache (author list fn called once); shared mode does not expand |
| Unit (existing updates) | `resolveLumpBranches`, `resolveEffectiveDiscoveryBranch`, `validateLumpDiscoveryBranchAllowlist`, `discoverDedicatedLumpsForScanBranch`, `validateDaemonLaunch`, `run`/`lump-plan` discovery tests, `jsConfigToRunLumpInput` baseBranch tests, cli-types `defineGetContextListFn` / recipes tests that call list fns without `discoveryBranch` |
| Integration | Dedicated fixture: `primaryBranches: ["dev", "feature/*"]` with remote heads; lump `discoveryBranches: ["dev", "feature/*"]`; tick/discover schedules on `dev` and `feature/a`; manual `--discoveryBranch feature/a` succeeds |
| E2E | Optional smoke: dedicated mock remote heads + one pattern lump; omit if unit/integration already cover expand→discover→run bind |

## Docs updates

| Document | Change |
| --- | --- |
| `DOCS/concepts.md` (Branch resolution) | Globs, first-exact primary, concrete discovery, `baseBranch` omit/fn, concurrent-cap note |
| `DOCS/local-config.md` | Glob entries, expansion, shared non-expansion, first-exact primary |
| `DOCS/lump-config.md` | `discoveryBranch` / `discoveryBranches`, allowlist, `baseBranch` fn |
| `DOCS/commands.md` | `--discoveryBranch` concrete-only; required when pattern-only; plan/status same |
| `localConfig.schema.json` / `lumpConfig.schema.json` | Descriptions + examples (`feature/*`, `discoveryBranches`) |

## Acceptance criteria

1. Dedicated `primaryBranches: ["dev", "feature/*"]` expands remote `feature/*` heads; primary is `dev`; all-glob config fails.
2. Empty glob match logs and skips; `ls-remote` failure fails the expand path.
3. Lump `discoveryBranches: ["dev", "feature/*"]` matches `dev` and `feature/a`; mutually exclusive with `discoveryBranch`.
4. Allowlist accepts exact `feature/a` when primary lists `feature/*`, and pattern `feature/*` when that string is a primary entry.
5. Daemon tick runs a matching lump once per concrete scan branch; `getContextListFn` / `contextMatchFn` observe that concrete `discoveryBranch`.
6. Flagless `run`/`lump-plan`/`lump-status` use first exact discovery rule; pattern-only without `--discoveryBranch` fails; flag must be concrete and match lump rules.
7. Omitted `baseBranch` equals concrete discovery; `baseBranch` fn runs on pre-status raw list (including `[]`) and core receives a string + cached list (one author list invocation).
8. Shared mode does not fan out on globs; `--discoveryBranch` still warn-and-ignore.
9. Docs/schema state glob dialect, first-exact primary, CLI flag rules, and shared `maximumNumberOfConcurrentBranches` across discovery lines.
10. `@lumpcode/core` `GetContextListFnInput` and `RunLumpInput.baseBranch: string` remain unchanged.

## Reference: resolution sketch

```text
effectivePrimaryBranches = configured list (exact + glob strings)
primary                = first exact in effectivePrimaryBranches   # fail if none
scanBranches           = expand(effectivePrimaryBranches)        # dedicated only

effectiveDiscovery     = --discoveryBranch concrete
                       | first exact lump discovery rule
                       | fail if lump discovery is pattern-only
                       # must match lump rules + primary allowlist

resolvedBaseBranch     = baseBranch string
                       | BaseBranchFn({ effectiveDiscoveryBranch, contexts: raw })
                       | effectiveDiscovery
```
