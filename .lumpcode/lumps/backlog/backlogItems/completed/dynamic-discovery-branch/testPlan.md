# Test plan: dynamic-discovery-branch

| Field | Value |
| --- | --- |
| **Backlog** | `dynamic-discovery-branch` |
| **Kind** | Feature — git-glob `primaryBranches` / lump discovery rules, concrete discovery binding, resolvable `baseBranch` |
| **Primary packages under test** | `@lumpcode/cli` (`packages/apps/cli`), author types in `cli-types` / `cli-utils`; call-site updates in `@lumpcode/recipes` tests/kit |
| **Not under test** | `@lumpcode/core` API shape (`GetContextListFnInput`, `RunLumpInput.baseBranch: string` stay unchanged); shared-mode glob fan-out; per-`(lumpName, discoveryLine)` concurrent caps; parallel scan-branch ticks; live agents; docs/schema prose snapshots (implementation checklist) |

Source of truth: [requirements.md](./requirements.md). This plan is the source of truth for the `testImpl` stage.

---

## 1. Goals of the test suite

Prove that after implementation:

1. Dedicated `primaryBranches` entries may be exact or git `ls-remote` globs; expansion yields a concrete scan set; **primary** = first **exact** entry; all-glob configs fail.
2. Empty glob matches log-and-skip; `ls-remote` failure fails the expand path.
3. Lump `discoveryBranch` **or** `discoveryBranches` (mutually exclusive) accept exact and/or glob rules; a concrete scan/flag branch matches if it equals an exact rule or matches a pattern rule; omit both → exact primary.
4. Dedicated allowlist validates configured discovery rules against **unexpanded** `primaryBranches` (exact-via-primary-glob and pattern-entry equality).
5. Daemon tick expands then scans each concrete branch; matching lumps run once per scan branch with that concrete effective discovery; author `getContextListFn` / `contextMatchFn` observe required `discoveryBranch: string`.
6. Flagless `run` / `start --lumpName` / `lump-plan` / `lump-status` use first exact discovery rule; pattern-only without `--discoveryBranch` fails; flag must be concrete, allowlisted, and match lump rules; shared mode warn-and-ignores the flag and does not expand globs.
7. Omitted `baseBranch` equals concrete discovery; `baseBranch` string must be exact; `BaseBranchFn` / FilePath runs on pre-status raw `contexts` (including `[]`); core receives a string `baseBranch` + cache-backed list fn (author source invoked once).
8. `@lumpcode/core` `GetContextListFnInput` and `RunLumpInput.baseBranch: string` remain unchanged (type/compile assert).

Docs / `localConfig.schema.json` / `lumpConfig.schema.json` updates are **implementation-stage acceptance**, not automated in `testImpl`.

---

## 2. Testing approach

| Level | Required? | Mechanism |
| --- | --- | --- |
| **Unit (glob helpers)** | Yes — primary for dialect | Pure string match + mocked `listRemoteHeadBranches` / `execAsync` for expand |
| **Unit (resolution / allowlist / effective discovery)** | Yes | Extend existing util suites; add missing `resolveEffectiveDiscoveryBranch` suite |
| **Unit / integration (CLI commands + discover)** | Yes | Real temp git + bare remote fixtures (existing `initBareRemoteAndCheckout` / `createIntegrationBranch`); spy `runLumpFromLumpName` for tick fan-out |
| **Unit (jsConfig bind + author types)** | Yes | `jsConfigToRunLumpInput` call-count + `baseBranch` fn; type tests for required `discoveryBranch` |
| **Recipes call sites** | Yes — compile/runtime green | Pass `discoveryBranch` into list-fn invocations in recipes kit/recipe tests |
| **E2E** | No new scenarios | Optional only if unit/integration leave a gap; prefer not |

### Prefer update over new when a host exists

| Host (today) | Becomes |
| --- | --- |
| `listRemoteHeadBranches/unit.test.ts` | Reuse for expand; do not duplicate ls-remote parsing |
| `resolvePrimaryBranches/unit.test.ts` | Extend: first-exact primary, all-glob fail, shared non-expansion consumers |
| `resolveLumpBranches/unit.test.ts` | Extend: `discoveryBranches`, pattern rules, base omit → concrete discovery |
| `validateLumpDiscoveryBranchAllowlist/unit.test.ts` | Rewrite/extend for rule list + glob allowlist (**A***) |
| `discoverDedicatedLumpsForScanBranch/unit.test.ts` | Pattern-match eligibility (**D***) |
| `validateDaemonLaunch/unit.test.ts` | Expand + pattern allowlist / all-glob fail at launch |
| `start/unit.test.ts` — multi-primary discovery order | Expand `feature/*` + fan-out (**T***) |
| `run` / `lump-plan` / `lump-status` discovery cases | Flag concrete-only, flagless first-exact, pattern-only fail (**F***, **C***) |
| `jsConfigToRunLumpInput/unit.test.ts` | Bind discovery + `baseBranch` fn + cache (**B***, **G***) |
| Recipes `folderBacklogContexts` / `backlog` list-fn calls | Add `discoveryBranch` arg (**R***) |

### Red → green during `testImpl` (skip both new and updated)

1. Write/extend all cases against the **post-implementation** contract.
2. Mark **every** case for this item with `it.skip` / `describe.skip` during `testImpl` — both **new** tests **and** **updated** hosts — so the suite stays green while product code is unchanged.
3. Add index-barrel-exported stubs (throwing `not implemented`) for new utils (`isGitRefGlob`, `branchMatchesGitGlob`, `expandPrimaryBranches`, and any new discovery-rule normalizer) so imports compile and unit tests run red once unskipped.
4. During **implementation**, unskip as behavior lands (or unskip all when complete). Do not leave updated hosts permanently skipped.

### Prefer real git for expand / discover; mock only ls-remote edges

- Happy-path expand + discover: real bare remote with pushed `feature/a`, `feature/b` heads (same style as `discoverDedicatedLumpsForScanBranch` / `start` suites).
- Empty-glob / `ls-remote` error / dedupe order: mock `listRemoteHeadBranches` or `execAsync` inside `expandPrimaryBranches` unit tests.

---

## 3. File layout (implementation details)

| Path | Role |
| --- | --- |
| `packages/apps/cli/src/utils/isGitRefGlob/{main,index,unit.test}.ts` | **Add** — pattern detect (`*` / `?` at minimum). Stub in `testImpl`; barrel from `utils/index.ts` |
| `packages/apps/cli/src/utils/branchMatchesGitGlob/{main,index,unit.test}.ts` | **Add** — in-process git-refname glob match. Stub + barrel |
| `packages/apps/cli/src/utils/expandPrimaryBranches/{main,index,unit.test}.ts` | **Add** — dedicated expand → concrete list or Failure. Stub + barrel |
| `packages/apps/cli/src/utils/resolvePrimaryBranches/{main,unit.test}.ts` | **Update** — first exact as primary; fail when no exact (**P***) |
| `packages/apps/cli/src/utils/resolveLumpBranches/{main,unit.test}.ts` | **Update** — normalize singular/plural rules; concrete discovery helpers as needed (**N***) |
| `packages/apps/cli/src/utils/validateLumpDiscoveryBranchAllowlist/{main,unit.test}.ts` | **Update** — rule allowlist vs unexpanded primaries (**A***) |
| `packages/apps/cli/src/utils/resolveEffectiveDiscoveryBranch/{main,unit.test}.ts` | **Update** main; **Add** `unit.test.ts` (**E***) |
| `packages/apps/cli/src/utils/discoverDedicatedLumpsForScanBranch/unit.test.ts` | **Update** — pattern eligibility (**D***) |
| `packages/apps/cli/src/utils/validateDaemonLaunch/unit.test.ts` | **Update** — expand / all-glob / pattern allowlist |
| `packages/apps/cli/src/commands/start/unit.test.ts` | **Update** — expand scan set + per-branch run (**T***) |
| `packages/apps/cli/src/commands/run/unit.test.ts` | **Update** — flag / flagless / pattern-only (**C***, **F***) |
| `packages/apps/cli/src/commands/lump-plan/unit.test.ts` | **Update** — same CLI discovery rules (**C***, **F***) |
| `packages/apps/cli/src/commands/lump-status/unit.test.ts` | **Update** — same CLI discovery rules (**C***, **F***) |
| `packages/apps/cli/src/utils/jsConfigToRunLumpInput/{main,unit.test}.ts` | **Update** — author bind + `baseBranch` fn + cache (**B***, **G***) |
| `packages/apps/cli/src/types/ContextMatchFn.ts` (+ CLI `GetContextListFn` author type if split from core) | **Update** — required `discoveryBranch: string` |
| `packages/apps/cli/cli-types` / `cli-utils` define helpers + type tests | **Update** — author params include `discoveryBranch` |
| `packages/recipes/src/kit/folderBacklogContexts/unit.test.ts` | **Update** — pass `discoveryBranch` (**R1**) |
| `packages/recipes/src/recipes/backlog/main.unit.test.ts` | **Update** — pass `discoveryBranch` (**R2**) |
| `packages/core/src/types/GetContextListFn.ts` (+ existing type tests) | **Assert unchanged** — no new fields (**K1**) |

If discovery-rule normalize is a private helper inside `resolveLumpBranches` / allowlist, keep it private — no new util directory unless reused from ≥2 call sites.

Run:

```bash
npm run test -w=@lumpcode/cli
npm run test -w=@lumpcode/cli-utils
npm run test -w=@lumpcode/cli-types
npm run test -w=@lumpcode/recipes
npm run test -w=@lumpcode/core
```

---

## 4. Shared test data / fixtures

### 4.1 Local config fragments

```json
{
  "mode": "dedicated",
  "primaryBranches": ["dev", "feature/*"]
}
```

| Variant | Purpose |
| --- | --- |
| `["dev", "feature/*"]` | Happy expand; primary = `dev` |
| `["feature/*", "dev"]` | Glob before exact; primary still `dev` (first exact) |
| `["feature/*"]` / `primaryBranch: "feature/*"` | All-glob → fail |
| `["dev", "feature/*", "dev"]` | Dedupe after expand |
| Shared: `{ "mode": "shared", "primaryBranches": ["dev", "feature/*"] }` | No expand; single exact primary behavior |

Use `dev` or `main` consistently with the fixture’s default branch (`initBareRemoteAndCheckout` today uses `main` — either rename fixture default to `dev` in new cases or substitute `main` for `dev` in expectations; pick one per suite and document in the test file).

### 4.2 Remote heads for expand

Bare remote with pushed heads:

| Branch | Present? |
| --- | --- |
| `main` / `dev` | Yes (primary) |
| `feature/a` | Yes |
| `feature/b` | Yes |
| `release/1` | Optional non-match control |

Seed via existing `createIntegrationBranch` or `git push origin HEAD:feature/a` from the temp project.

### 4.3 Lump discovery configs

```json
{
  "discoveryBranches": ["dev", "feature/*"],
  "contextListJson": { "FILE": "src/{NAME}.ts" },
  "prompt": { "promptTemplate": "Improve @{FILE}.", "command": "claude" }
}
```

| Variant | Purpose |
| --- | --- |
| `discoveryBranches: ["dev", "feature/*"]` | Multi-line match |
| `discoveryBranch: "feature/*"` only | Pattern-only → flag required |
| `discoveryBranch: "dev"` + `discoveryBranches: [...]` | Mutual exclusion fail |
| Omit both | Effective exact primary |
| `discoveryBranch: "feature/a"` with primary `feature/*` | Exact allowlisted via primary glob |

Reuse `writeMinimalLump` / `minimalLumpConfigJson` from command suites; extend overrides with `discoveryBranches`.

### 4.4 Mocked `listRemoteHeadBranches` (expand unit edges)

```ts
// empty glob
mockResolvedValue([])
// error path
mockRejectedValue / Failure from execAsync
// ordered remotes
mockResolvedValue(['feature/b', 'feature/a']) // assert deterministic union order per expand contract
```

### 4.5 Author list fn + baseBranch fn (bind proofs)

```ts
let listCalls = 0;
const getContextListFn = ({ discoveryBranch }: { discoveryBranch: string; codeBasePaths: unknown[]; lumpVariables: object }) => {
  listCalls += 1;
  return discoveryBranch === 'feature/a'
    ? [{ name: 'ctx-a', variables: { FILE: 'a.ts' } }]
    : [];
};

const baseBranchFn = ({ effectiveDiscoveryBranch, contexts }) => {
  // record args; return e.g. contexts[0] ? 'exec/' + contexts[0].name : effectiveDiscoveryBranch
  return effectiveDiscoveryBranch;
};
```

Assert `listCalls === 1` after `jsConfigToRunLumpInput` + one core `getContextListFn` invocation.

### 4.6 Deferred `runLumpFromLumpName` spy (tick fan-out)

Reuse start suite pattern: spy records `{ lumpName, discoveryBranch }` (or whatever phase-1 passes as effective discovery). Release gates so tick completes. Assert one invocation per matching `(lump, scanBranch)`.

### 4.7 CLI flag samples

| Flag value | Expect |
| --- | --- |
| `feature/a` | Concrete OK when allowlisted + matches lump |
| `feature/*` | Reject (pattern) |
| `feature/z` (no remote head) | Allowlist OK; fail later at preflight if branch missing |
| omitted + pattern-only lump | Fail asking for `--discoveryBranch` |
| omitted + `["dev", "feature/*"]` | Effective `dev` (first exact) |

---

## 5. Test cases

Each case: **ID**, **setup/data**, **expectation**, **where**.

### 5.1 Glob detect / match (**G** — new utils)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| G1 | Exact is not a pattern | `"dev"`, `"feature/a"` | `isGitRefGlob` → `false` |
| G2 | Glob metacharacters | `"feature/*"`, `"feature/?"`, `"feat*/a"` | `isGitRefGlob` → `true` |
| G3 | Exact equality match | pattern `"feature/a"`, branch `"feature/a"` | If caller uses exact path: match without glob engine; `branchMatchesGitGlob` only used for pattern rules |
| G4 | `*` match | `"feature/*"` vs `"feature/a"`, `"feature/b"` | Match; vs `"feature/a/b"` or `"dev"` → no match (match git `ls-remote` refname glob semantics for single-segment `*`) |
| G5 | `?` match | `"feature/?"` vs `"feature/a"` | Match; vs `"feature/ab"` → no |
| G6 | Exact never glob-matched | Rule `"feature/a"` vs `"feature/b"` | No match even if `*` semantics would not apply — exact string equality only |

**Where:** `packages/apps/cli/src/utils/isGitRefGlob/unit.test.ts`, `packages/apps/cli/src/utils/branchMatchesGitGlob/unit.test.ts` (`describe.skip` / stubs until implementation).

Document the chosen `*` segment semantics in the util file to match `git ls-remote --heads origin <pattern>` for the cases above; if git treats `*` differently for multi-segment names, align tests to observed `git` behavior in the fixture rather than inventing a dialect.

### 5.2 Expand primaryBranches (**X** — new)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| X1 | Exact + glob union | Config `["dev", "feature/*"]`; remote `feature/a`, `feature/b` | Success; concrete includes `dev`, `feature/a`, `feature/b`; deterministic stable order (document: configured-entry order, exact first-as-listed, then glob hits in ls-remote/dedupe order) |
| X2 | Exact kept as-is | Exact entry with no remote head yet | Still present in concrete list (missing branch fails later at preflight, not expand) |
| X3 | Empty glob | Glob matches nothing | Log (info/warn via injected logger); that entry contributes nothing; other entries kept; overall success |
| X4 | `ls-remote` error | `listRemoteHeadBranches` / exec Failure | Expand returns Failure; message mentions expand / ls-remote / pattern |
| X5 | Dedupe | Config `["dev", "feature/*"]` and glob also returns `dev`, or duplicate exact | Each branch once |
| X6 | Shared mode | `mode: 'shared'`, globs in list | Expand **not** used for scan (or returns only exact primary); assert via consumer **S1** / start shared path — unit may early-return configured exacts only |

**Where:** `packages/apps/cli/src/utils/expandPrimaryBranches/unit.test.ts` (new). Prefer mocking `listRemoteHeadBranches` for X3–X5; optional one real-git X1 integration-style case in the same file or in start **T1**.

### 5.3 Primary = first exact (**P** — update `resolvePrimaryBranches`)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| P1 | First exact amid globs | `["feature/*", "dev", "main"]` | Resolved primary / first-exact helper → `"dev"` |
| P2 | Leading exact | `["dev", "feature/*"]` | Primary `"dev"` |
| P3 | All-glob array | `["feature/*"]` | Failure (or throw/Failure from validation helper used by launch/run) with clear message — no exact primary |
| P4 | Singular glob | `primaryBranch: "feature/*"` | Same failure as P3 |
| P5 | Precedence unchanged | Non-empty `primaryBranches` wins over singular | Existing LC-* cases stay; first-exact applies to winning list |
| P6 | Legacy alias | `projectBaseBranch: "dev"` only | Still works; primary `"dev"`; warn-once preserved |

**Where:** `packages/apps/cli/src/utils/resolvePrimaryBranches/unit.test.ts`. If first-exact lives in a sibling validator used by expand/launch, put P3–P4 there and keep P1–P2 on the resolver that returns the primary string.

### 5.4 Discovery rule normalize / resolve (**N** — update `resolveLumpBranches`)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| N1 | Singular only | `discoveryBranch: "dev"` | Rules = `["dev"]` |
| N2 | Plural only | `discoveryBranches: ["dev", "feature/*"]` | Rules = that array (order preserved) |
| N3 | Both set | Singular + plural | Validation Failure (config load / resolve / allowlist prelude) |
| N4 | Omit both | `{}` + primary `"dev"` | Effective rule = exact `"dev"` |
| N5 | Match exact | Rules `["dev", "feature/*"]`, scan `"dev"` | Eligible |
| N6 | Match pattern | Same rules, scan `"feature/a"` | Eligible |
| N7 | No match | Same rules, scan `"release/1"` | Not eligible |
| N8 | `resolvedBaseBranch` omit | No `baseBranch`; concrete discovery `"feature/a"` | Base resolves to `"feature/a"` at CLI bind time (string path); pure `resolveLumpBranches` may still describe fallback chain — assert final string in **B1** |

**Where:** `packages/apps/cli/src/utils/resolveLumpBranches/unit.test.ts` and/or a small normalize helper test colocated there.

### 5.5 Allowlist (**A** — update `validateLumpDiscoveryBranchAllowlist`)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| A1 | Exact primary entry | Rule/flag `"dev"`, primaries `["dev", "feature/*"]` | Success |
| A2 | Exact via primary glob | Concrete `"feature/a"`, primaries `["dev", "feature/*"]` | Success (matches primary glob) |
| A3 | Pattern rule equality | Lump rule `"feature/*"`, same string in primaries | Success |
| A4 | Pattern not in primaries | Lump rule `"hotfix/*"`, primaries `["dev", "feature/*"]` | Failure; message includes lump name + rule |
| A5 | Exact not covered | Concrete `"ver/0.0.7"`, primaries `["dev", "feature/*"]` | Failure |
| A6 | Shared skips allowlist | Any branch, `mode: 'shared'` | Success |
| A7 | Existing exact-list cases | `["main", "ver/0.0.9"]` without globs | Still pass/fail as today |

API may grow from single `resolvedDiscoveryBranch` to validating configured **rules** and/or concrete flag values — update `ValidateLumpDiscoveryBranchAllowlistInput` as needed; keep shared short-circuit.

**Where:** `packages/apps/cli/src/utils/validateLumpDiscoveryBranchAllowlist/unit.test.ts`.

### 5.6 Effective discovery / CLI flag (**E**, **C**, **F**)

#### `resolveEffectiveDiscoveryBranch` (**E**)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| E1 | Dedicated flag concrete | `--discoveryBranch feature/a`, allowlisted, matches lump | Success `"feature/a"` |
| E2 | Dedicated flag is pattern | `--discoveryBranch feature/*` | Failure; message requires concrete branch |
| E3 | Flagless first exact | Rules `["dev", "feature/*"]`, no flag | Success `"dev"` |
| E4 | Flagless pattern-only | Rules `["feature/*"]`, no flag | Failure; message mentions `--discoveryBranch` |
| E5 | Flag mismatches lump rules | Flag `"dev"`, rules `["feature/*"]` only | Failure |
| E6 | Shared flag ignored | Shared + flag | Warning/info once when requested; effective discovery follows shared path (operator-managed / primary), not the flag |
| E7 | Flag allowlist fail | Dedicated flag `"ver/x"` not covered by primaries | Failure (allowlist) |

**Where:** `packages/apps/cli/src/utils/resolveEffectiveDiscoveryBranch/unit.test.ts` (**Add**).

#### Commands (**C** / **F**)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| C1 | `run` flagless first exact | Multi-rule lump | Proceeds with effective discovery = first exact (spy/assert phase-1 or preflight target) |
| C2 | `run` pattern-only no flag | Pattern-only lump | Failure before preflight; message mentions `--discoveryBranch` |
| C3 | `run --discoveryBranch feature/a` | Multi-rule lump + primary glob | Success path reaches `runLumpFromLumpName` / preflight for `feature/a` |
| C4 | `run --discoveryBranch feature/*` | Any | Failure; concrete-only |
| F1–F4 | Same matrix for `lump-plan` and `lump-status` | Mirror C1–C4 | Same outcomes (non-destructive; no preflight required, but discovery resolution still applies) |
| C5 | Shared `run` + flag | Shared mode | Warn-and-ignore; does not fail solely for unlisted discovery (existing shared case stays) |

**Where:**

- `packages/apps/cli/src/commands/run/unit.test.ts`
- `packages/apps/cli/src/commands/lump-plan/unit.test.ts`
- `packages/apps/cli/src/commands/lump-status/unit.test.ts`

`start --lumpName` flag/flagless cases belong with **T** / **E** (solo daemon uses `resolveEffectiveDiscoveryBranch`).

### 5.7 Discover filter + daemon tick (**D**, **T**, **V**)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| D1 | Scan `dev` | Lump `discoveryBranches: ["dev", "feature/*"]` + exact-only other lump | Returns multi-line lump (and any exact-`dev` lumps); excludes feature-only |
| D2 | Scan `feature/a` | Same multi-line lump | Returns multi-line lump; excludes `discoveryBranch: "dev"`-only lumps |
| D3 | Scan non-match | `release/1` | Multi-line lump omitted |
| T1 | Tick expand order | Primaries `["dev", "feature/*"]`; remotes `feature/a`; spy runs | Invocations include discovery `dev` then `feature/a` (or documented expand order); multi-line lump run twice with distinct concrete discovery |
| T2 | Same name different scans | Same `lumpName` config on two scan branches (eligible both) | Launch OK; tick runs both; duplicate name **same** scan still fails launch (**V2**) |
| T3 | Branch expand failure | `ls-remote` fails during launch/tick expand | Launch Failure or tick logs and continues per existing resilience — assert the requirements’ expand Failure on the path that needed expansion (`validateDaemonLaunch` / tick prelude) |
| T4 | Empty glob at tick | `feature/*` matches nothing | Scan set = exacts only; no crash; log skip |
| V1 | All-glob primaries at launch | `primaryBranches: ["feature/*"]` | `validateDaemonLaunch` / start fails |
| V2 | Duplicate lumpName same scan | Two dirs same name after expand filter | Fail launch (existing behavior retained) |
| V3 | Pattern allowlist at launch | Lump `discoveryBranches: ["hotfix/*"]` not in primaries | Fail launch |

**Where:**

- `packages/apps/cli/src/utils/discoverDedicatedLumpsForScanBranch/unit.test.ts` (**D***)
- `packages/apps/cli/src/commands/start/unit.test.ts` (**T***)
- `packages/apps/cli/src/utils/validateDaemonLaunch/unit.test.ts` (**V***)

### 5.8 Author `discoveryBranch` bind + `baseBranch` (**B**, **G**, **K**)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| B1 | Omit `baseBranch` | Concrete discovery `"feature/a"` | `RunLumpInput.baseBranch === "feature/a"` |
| B2 | String `baseBranch` | `"exec/line"` exact | Core input uses that string |
| B3 | Pattern string `baseBranch` | `"feature/*"` | Failure at resolve |
| B4 | `BaseBranchFn` sees raw list | Fn records `{ effectiveDiscoveryBranch, contexts }`; author returns non-empty contexts | Fn args use **pre-status** raw list; returned string becomes `baseBranch` |
| B5 | `BaseBranchFn` with `[]` | Author returns `[]` | Fn still called with `contexts: []`; may return discovery or other exact; core gets string |
| B6 | Cache — one author call | Instrumented `getContextListFn` | After bind + invoking core list fn once, author call count is `1` |
| B7 | `getContextListFn` receives discovery | Author fn asserts `params.discoveryBranch === "feature/a"` | Passes at bind / adapted call |
| B8 | `contextMatchFn` receives discovery | Match fn asserts `discoveryBranch` | Adapted getContextList path passes it |
| G1t | Type: author list params | `defineGetContextListFn` / CLI `GetContextListFn` | `params.discoveryBranch` is `string` (required) |
| G2t | Type: `ContextMatchFn` | Same | Required `discoveryBranch: string` |
| G3t | Type: core unchanged | `@lumpcode/core` `GetContextListFnInput` | **No** `discoveryBranch` property (`expectTypeOf` / `@ts-expect-error`) |
| G4t | Type: core `baseBranch` | `RunLumpInput['baseBranch']` | Remains `string` (not fn) |
| K1 | Runtime core import smoke | Optional | Existing core getContextList tests still call without `discoveryBranch` |

**Where:**

- `packages/apps/cli/src/utils/jsConfigToRunLumpInput/unit.test.ts` (**B***)
- `packages/apps/cli/cli-utils/src/defineHelpers.types.test.ts` and/or new CLI types test (**G***)
- `packages/core/src/types/typedVariables.types.test.ts` or `GetContextListFn` adjacent type test (**G3t**, **G4t**)

### 5.9 Shared mode non-expansion (**S**)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| S1 | Globs in `primaryBranches` | Shared + `["dev", "feature/*"]` | No multi-branch scan fan-out; warn-once multi-primary behavior retained as today; only exact primary used for defaults |
| S2 | Lump discovery rules ignored for scheduling | Shared daemon/run | Existing “no allowlist / discovery operator-managed” behavior; globs do not schedule extra scans |
| S3 | `--discoveryBranch` warn-and-ignore | Shared run/start solo | Info/warn; flag does not become effective discovery |

**Where:** `packages/apps/cli/src/commands/run/unit.test.ts`, `start/unit.test.ts`, and/or `resolveEffectiveDiscoveryBranch/unit.test.ts` (**E6**).

### 5.10 Recipes / kit call-site updates (**R**)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| R1 | `folderBacklogContexts` invocations | All `getContextListFn({...})` in unit tests | Include `discoveryBranch: '<any-concrete>'` (e.g. `'main'`) so types compile; behavior unchanged |
| R2 | `backlog` recipe list calls | Same | Same |
| R3 | Other recipe tests calling list fns | `featureBacklog` / `ephemeralContextListFn` if they invoke with explicit params | Update call sites; kit implementations should accept and ignore `discoveryBranch` unless a recipe filters by it (out of scope to add filtering here) |

**Where:**

- `packages/recipes/src/kit/folderBacklogContexts/unit.test.ts`
- `packages/recipes/src/recipes/backlog/main.unit.test.ts`
- Grep-driven updates to any remaining `getContextListFn({ codeBasePaths` call sites under `packages/recipes`

---

## 6. Existing suite migration notes

| Host | Migration |
| --- | --- |
| `validateLumpDiscoveryBranchAllowlist` exact `includes` tests | Keep A7; add glob allowlist; may change input shape from single concrete to rules + concrete |
| `resolveLumpBranches` “discovery or primary” | Still valid for omit-both / singular exact; add plural + pattern eligibility helpers |
| `resolvePrimaryBranch` “first element” | **Change** when first element is a glob — must skip to first exact (P1); update any test that assumed index `0` always |
| `discoverDedicatedLumpsForScanBranch` exact filter | Filter via rule match (exact or glob), not string equality alone |
| `start` “preflights discovery branches in primaryBranches order” | After expand, order is expanded concrete set; keep order asserts on expanded list |
| `run` / plan / status unlisted discovery | Extend messages for glob allowlist; pattern-only flagless is new failure mode |
| `jsConfigToRunLumpInput` “pass through getContextListFn” | May become adapted wrapper (discovery bind + cache) — assert behavioral equivalence + **B6** call count, not `toBe` same function reference if wrapping is required |
| `cli-utils` / `cli-types` `defineGetContextListFn` type tests | Expect `discoveryBranch` on params; fix `@ts-expect-error` placements |
| Recipes list-fn calls | Always pass concrete `discoveryBranch` |

All new/updated cases for this item: `it.skip` / `describe.skip` in `testImpl`.

---

## 7. Out of scope (explicit)

| Item | Why |
| --- | --- |
| New E2E with live agents proving feature-line fan-out | Requirements: optional; unit/integration sufficient |
| Shared-mode glob expansion / fan-out | Non-goal |
| Per-`(lumpName, discoveryLine)` `maximumNumberOfConcurrentBranches` | Non-goal; document shared cap only (checklist) |
| Changing core `GetContextListFnInput` or functional `RunLumpInput.baseBranch` | Non-goal (**G3t**/**G4t** guard) |
| Using glob strings as checkout / `baseBranch` refs | Non-goal (B3) |
| Parallel scan-branch execution within a tick | Separate backlog |
| Renaming `primaryBranches` → `discoveryBranches` in `local.json` | Non-goal |
| Docs/schema text snapshot tests | Implementation checklist §10 |

---

## 8. Acceptance mapping

| Requirements acceptance | Covered by |
| --- | --- |
| 1. Expand `["dev", "feature/*"]`; primary `dev`; all-glob fails | X1, P1–P4, V1, T1 |
| 2. Empty glob log-and-skip; ls-remote fail expand | X3, X4, T3, T4 |
| 3. `discoveryBranches` match; mutual exclusion with singular | N2, N3, N5, N6, D1, D2 |
| 4. Allowlist exact-via-glob + pattern-entry equality | A2, A3, A4, A5, V3 |
| 5. Daemon tick once per concrete scan; author sees concrete discovery | T1, B7, B8 |
| 6. Flagless first exact; pattern-only needs flag; flag concrete + match | E3, E4, E2, E5, C1–C4, F1–F4 |
| 7. Omit base = discovery; fn on raw list; cache one author call | B1, B4, B5, B6 |
| 8. Shared no fan-out; flag warn-and-ignore | S1–S3, E6, C5 |
| 9. Docs/schema + concurrent-cap note | §10 checklist |
| 10. Core input shapes unchanged | G3t, G4t, K1 |

---

## 9. Commands to run

```bash
npm run test -w=@lumpcode/cli
npm run test -w=@lumpcode/cli-utils
npm run test -w=@lumpcode/cli-types
npm run test -w=@lumpcode/recipes
npm run test -w=@lumpcode/core
```

Optional focus during red/green:

```bash
npm run test -w=@lumpcode/cli -- src/utils/isGitRefGlob/unit.test.ts
npm run test -w=@lumpcode/cli -- src/utils/branchMatchesGitGlob/unit.test.ts
npm run test -w=@lumpcode/cli -- src/utils/expandPrimaryBranches/unit.test.ts
npm run test -w=@lumpcode/cli -- src/utils/resolvePrimaryBranches/unit.test.ts
npm run test -w=@lumpcode/cli -- src/utils/resolveLumpBranches/unit.test.ts
npm run test -w=@lumpcode/cli -- src/utils/validateLumpDiscoveryBranchAllowlist/unit.test.ts
npm run test -w=@lumpcode/cli -- src/utils/resolveEffectiveDiscoveryBranch/unit.test.ts
npm run test -w=@lumpcode/cli -- src/utils/discoverDedicatedLumpsForScanBranch/unit.test.ts
npm run test -w=@lumpcode/cli -- src/utils/validateDaemonLaunch/unit.test.ts
npm run test -w=@lumpcode/cli -- src/utils/jsConfigToRunLumpInput/unit.test.ts
npm run test -w=@lumpcode/cli -- src/commands/start/unit.test.ts
npm run test -w=@lumpcode/cli -- src/commands/run/unit.test.ts
npm run test -w=@lumpcode/cli -- src/commands/lump-plan/unit.test.ts
npm run test -w=@lumpcode/cli -- src/commands/lump-status/unit.test.ts
npm run test -w=@lumpcode/recipes -- src/kit/folderBacklogContexts/unit.test.ts
npm run test -w=@lumpcode/recipes -- src/recipes/backlog/main.unit.test.ts
```

---

## 10. Implementation-stage checklist (not automated here)

Confirm manually / by review when implementing:

- [ ] `isGitRefGlob` / `branchMatchesGitGlob` / `expandPrimaryBranches` implemented and barrel-exported from `utils/index.ts`
- [ ] `resolvePrimaryBranches` / primary helpers: first **exact**; fail when none
- [ ] Dedicated expand wired into daemon launch, tick, and any run prelude that builds the scan set
- [ ] `LumpJsConfig.discoveryBranches?: string[]`; mutual exclusion with `discoveryBranch`; JSON schema descriptions/examples (`feature/*`)
- [ ] `validateLumpDiscoveryBranchAllowlist` uses unexpanded primaries + glob dialect
- [ ] `resolveEffectiveDiscoveryBranch`: concrete flag only; flagless first exact; pattern-only fail; shared warn-and-ignore
- [ ] `discoverDedicatedLumpsForScanBranch` filters by rule match; tick runs per concrete scan branch
- [ ] CLI author `getContextListFn` / `ContextMatchFn` require `discoveryBranch`; adapt to core signature at `jsConfigToRunLumpInput` (or adjacent bind helper)
- [ ] `baseBranch`: `string | BaseBranchFn | FilePath`; fn input `{ effectiveDiscoveryBranch, contexts }`; pre-resolve to string; cache-backed core list fn
- [ ] `localConfig.schema.json` / `lumpConfig.schema.json` examples for globs + `discoveryBranches`
- [ ] DOCS: `concepts.md` (Branch resolution — globs, first-exact primary, concrete discovery, `baseBranch` omit/fn, shared `maximumNumberOfConcurrentBranches` across lines), `local-config.md`, `lump-config.md`, `commands.md` (`--discoveryBranch` concrete-only)
- [ ] Recipes/kit list-fn signatures accept `discoveryBranch` (ignore if unused)
- [ ] `@lumpcode/core` `GetContextListFnInput` / `RunLumpInput.baseBranch: string` untouched
- [ ] All `it.skip` / `describe.skip` for this item unskipped and green
