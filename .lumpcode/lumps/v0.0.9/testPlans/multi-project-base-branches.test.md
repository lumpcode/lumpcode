# Test plan: Multi discovery branches (integration-line-aware discovery and runs)

| Field | Value |
| --- | --- |
| **Backlog** | `multi-project-base-branches` · priority **1** |
| **PRD** | [multi-project-base-branches.prd.md](../prds/multi-project-base-branches.prd.md) |
| **Design reference** | [multi-project-base-branches.reference.md](../multi-project-base-branches.reference.md) |
| **Packages** | `packages/apps/cli` (primary); `packages/apps/cli/cli-types` (`discoveryBranch` on `defineConfig`); `@lumpcode/core` unchanged |
| **Out of scope** | LRU branch scheduling; cross-branch cross-lump dependency resolution; `GetContextListFnInput.baseBranch`; shared-mode multi-branch daemon scan; `allowUnlistedBaseBranch`; cross-discovery-branch duplicate lumpName fail; `project-setup` scaffolding `discoveryBranches`; npm package cross-links |

## Summary

Verify **`discoveryBranch` / `discoveryBranches`** in `.lumpcode/local.json`, lump **`discoveryBranch`** (inventory) vs **`baseBranch`** (execution), dedicated-only **`discoveryBranch`** allowlist on `run` / `lump-plan` / `lump-status` / daemon, per-lump pre-flight to **`resolvedBaseBranch`**, dedicated daemon launch fail-fast and discovery-branch-ordered ticks, shared mode (no allowlist, `discoveryBranch` ignored, multi-list warning), workspace teardown on **`resolvedBaseBranch`**, `clean` without pre-flight, same-branch duplicate lumpName fail (cross-branch same name OK), and cross-lump **`baseBranch`** mismatch warnings.

**Scope:** ~45–55 `it()` blocks across new util tests, CLI unit test updates, one new `commands/run/unit.test.ts`, extended `start` / `clean` tests, and 4–6 E2E scenarios.

### Layering

| Layer | Files | Responsibility |
| --- | --- | --- |
| Config helpers | `resolveDiscoveryBranches/unit.test.ts`, `validateLumpDiscoveryBranchAllowlist/unit.test.ts`, `readLocalConfig/unit.test.ts` | Effective list, primary, parse, dedicated allowlist |
| Branch resolution | `resolveLumpBaseBranch/unit.test.ts` (or combined util) | `baseBranch` fallback chain including `project.json` |
| Pre-flight / workspace | `runProjectPreflight/unit.test.ts`, `makeLumpWorkspaceFns/unit.test.ts`, `jsConfigToRunLumpInput/unit.test.ts` | `targetBranch`, teardown switch-back |
| Run / plan | `runLumpFromJsConfig/unit.test.ts`, `planLumpFromJsConfig/unit.test.ts`, `commands/run/unit.test.ts` | Dedicated allowlist, pre-flight order |
| Daemon | `commands/start/unit.test.ts` | Launch, tick loop, `--lumpName`, warnings |
| Clean | `commands/clean/unit.test.ts` | No pre-flight |
| E2E | `e2e/daemon-scenarios.test.ts` | Subprocess multi-discovery |

## Test environment

- **Node:** 22+
- **Runner:** Vitest (`npm run test` in `packages/apps/cli`)
- **Conventions:** temp `projectRoot`; local git identity before commits; real git over mocking handlers; `cwd` with `execAsync`/`execSync`
- **Daemon tests:** `setDaemonTestGlobalConfigFolder`, `aliveDaemonSpawnFn`, `waitForDaemonPidFile` from `testing/`
- **E2E:** rebuild `build:bundle` + `build:sea` after CLI changes

### Commands

```bash
cd packages/apps/cli && npm run test
cd packages/apps/cli && npm run test -- src/utils/resolveDiscoveryBranches/unit.test.ts
cd packages/apps/cli && npm run test:e2e
```

### Shared test helpers

Add `packages/apps/cli/src/testing/multiBranchFixtures.ts` (barrel from `testing/index.ts`):

| Helper | Purpose |
| --- | --- |
| `initBareRemoteAndCheckout` | Bare remote + checkout with identity |
| `createIntegrationBranch` | Branch + lump specs + push |
| `writeLocalJson` | Write `.lumpcode/local.json` |
| `writeMinimalLump` | Lump `config.json` on current branch |
| `gitCurrentBranch` / `assertCheckoutBranch` | HEAD assertions |

Branch names: `main`, `ver/0.0.9`, `ver/0.0.7`.

---

## Test data

### Local config fixtures

| ID | `local.json` body | Notes |
| --- | --- | --- |
| `LC-SINGLE` | `{ "mode": "dedicated", "discoveryBranch": "main" }` | `["main"]` |
| `LC-MULTI` | `{ "mode": "dedicated", "discoveryBranch": "main", "discoveryBranches": ["main", "ver/0.0.9"] }` | Array wins |
| `LC-MULTI-ARRAY-ONLY` | `{ "mode": "dedicated", "discoveryBranches": ["main", "ver/0.0.9"] }` | Valid without singular |
| `LC-MULTI-ORDER` | `{ "mode": "dedicated", "discoveryBranches": ["ver/0.0.9", "main"] }` | Tick order |
| `LC-SHARED` | `{ "mode": "shared", "discoveryBranch": "main", "discoveryBranches": ["main", "ver/0.0.9"] }` | Warning + no multi-loop |
| `LC-EMPTY-ARRAY` | `{ "discoveryBranches": [] }` | Parse fail |
| `LC-DUPES` | `{ "discoveryBranches": ["main", "main"] }` | Parse fail |

### Lump config fixtures

| ID | Key fields | `resolvedDiscoveryBranch` | `resolvedBaseBranch` | Dedicated allowlist |
| --- | --- | --- | --- | --- |
| `LUMP-MAIN` | (defaults) | `main` | `main` | pass with `LC-MULTI` |
| `LUMP-VER` | `"discoveryBranch": "ver/0.0.9"` | `ver/0.0.9` | `ver/0.0.9` | pass |
| `LUMP-SPLIT` | `"discoveryBranch": "main", "baseBranch": "ver/0.0.9"` | `main` | `ver/0.0.9` | pass (`discoveryBranch` listed) |
| `LUMP-UNLISTED` | `"discoveryBranch": "ver/0.0.7"` | `ver/0.0.7` | `ver/0.0.7` | fail |
| `LUMP-BASE-ONLY` | `"baseBranch": "ver/0.0.9"` (no discovery) | `main` (primary) | `ver/0.0.9` | pass if primary listed |

Minimal runnable lump JSON (daemon/E2E):

```json
{
  "contextListJson": { "NAME": "README" },
  "prompt": { "promptTemplate": "E2E @{NAME}", "command": "e2e-agent" }
}
```

### Multi-branch repo layout

- `mainLine` on `main` only (`discoveryBranch: main` or default)
- `releaseLine` on `ver/0.0.9` only (`discoveryBranch: ver/0.0.9`)

**Cross-branch same name (allowed):** lump `sharedName` on both `main` and `ver/0.0.9` with matching `discoveryBranch` each — daemon launch **succeeds**.

**Same-branch duplicate (fail):** two entries same `lumpName` on one checkout after pre-flight — use invalid fixture only if implementer adds explicit detection beyond `readdir` (normally impossible); test documents expected launch behavior if duplicate folders could exist.

### Cross-lump dependency warning fixture

On `main`, `consumer` depends on `provider/ctx`; `provider` has `baseBranch: ver/0.0.9`. Expect warning; launch succeeds.

---

## Automated tests

### 1. `resolveDiscoveryBranches` (new util)

**File:** `packages/apps/cli/src/utils/resolveDiscoveryBranches/unit.test.ts`

| `it()` | Expectation |
| --- | --- |
| Singular only (`LC-SINGLE`) | `["main"]` |
| Array wins (`LC-MULTI`) | `["main", "ver/0.0.9"]`; does not merge singular |
| Array only (`LC-MULTI-ARRAY-ONLY`) | `["main", "ver/0.0.9"]` |
| Order preserved (`LC-MULTI-ORDER`) | `["ver/0.0.9", "main"]` |
| `resolvePrimaryDiscoveryBranch` | first element of effective list |

---

### 2. `readLocalConfig` — `discoveryBranches` validation

**File:** `readLocalConfig/unit.test.ts` (extend)

| `it()` | Expectation |
| --- | --- |
| Accepts valid `discoveryBranches` | success |
| Accepts array-only (`LC-MULTI-ARRAY-ONLY`) | success without singular |
| Rejects empty array | failure |
| Rejects duplicates | failure |
| Rejects non-string elements | Zod failure |
| Fails when both absent | `{ "mode": "dedicated" }` → failure |

---

### 3. `resolveLumpBaseBranch` / resolution chain

**File:** new util test or part of `jsConfigToRunLumpInput/unit.test.ts`

| `it()` | Expectation |
| --- | --- |
| Explicit `baseBranch` | uses it |
| Omitted `baseBranch`, `discoveryBranch` set | `resolvedBaseBranch` = `discoveryBranch` |
| Both omitted | `resolvedBaseBranch` = `primaryDiscoveryBranch` |
| All omitted, `project.json projectBaseBranch` | legacy last priority |
| `resolvedDiscoveryBranch` | `lump.discoveryBranch ?? primaryDiscoveryBranch` |

---

### 4. `validateLumpDiscoveryBranchAllowlist` (new util)

**File:** `validateLumpDiscoveryBranchAllowlist/unit.test.ts`

| `it()` | Expectation |
| --- | --- |
| Listed `discoveryBranch` | `success()` |
| Unlisted | `failure()` with lump name and branch |
| `mode: shared` | **always `success()`** (no allowlist) |
| Uses `resolveDiscoveryBranches` | pass `LC-MULTI` + `LUMP-VER` |

Input: `{ mode, lumpName, resolvedDiscoveryBranch, effectiveDiscoveryBranches }`.

---

### 5. `runProjectPreflight` — `targetBranch`

**File:** `runProjectPreflight/unit.test.ts` (extend)

| `it()` | Expectation |
| --- | --- |
| Default | dedicated: primary discovery branch |
| `targetBranch: 'ver/0.0.9'` | HEAD at execution workspace is `ver/0.0.9` |
| Missing branch on origin | `failure()` |
| Shared + `targetBranch` | copy on branch, source untouched |

---

### 6. `makeLumpWorkspaceFns` — teardown

| `it()` | Expectation |
| --- | --- |
| Teardown uses `resolvedBaseBranch` | `git switch ver/0.0.9` when lump execution branch is `ver/0.0.9`, not primary `main` |

---

### 7. `runLumpFromJsConfig` / `planLumpFromJsConfig`

| `it()` | Expectation |
| --- | --- |
| Dedicated unlisted `discoveryBranch` | `failure()` before `runLump` |
| Dedicated listed | proceeds |
| Shared unlisted `discoveryBranch` | **proceeds** (no allowlist) |
| `planLumpFromJsConfig` dedicated unlisted | `failure()` |

---

### 8. `run` command

**File:** `commands/run/unit.test.ts` (**new**)

| `it()` | Expectation |
| --- | --- |
| Missing lump on checkout | fail before pre-flight |
| Dedicated unlisted `discoveryBranch` | fail; allowlist message |
| Dedicated listed | pre-flight to `resolvedBaseBranch` |
| `LUMP-SPLIT` | pre-flight to `ver/0.0.9` while discovery on `main` |
| Shared unlisted `discoveryBranch` | **run proceeds** |
| Config load before pre-flight | spy order |

---

### 9. `start` — dedicated daemon launch

**File:** `commands/start/unit.test.ts` (extend)

| `it()` | Expectation |
| --- | --- |
| Multi-discovery launch success | `mainLine` + `releaseLine` on separate branches |
| Cross-branch same `lumpName` | `sharedName` on `main` and `ver/0.0.9` — launch **succeeds** |
| Unlisted `discoveryBranch` at launch | fail |
| Cross-lump `baseBranch` mismatch | warning; launch succeeds |
| `start --lumpName` unlisted | fail (dedicated) |
| `start --lumpName` listed | succeeds |
| Shared + `discoveryBranches` | succeeds; log contains multi-discovery dedicated-only message; no branch loop |

---

### 10. `start` — dedicated daemon tick

| `it()` | Expectation |
| --- | --- |
| Discovery branch order | `LC-MULTI-ORDER`: pre-flight `ver/0.0.9` then `main` |
| Lumps per discovery branch | A+B on `main`, C on `ver/0.0.9`; correct run order |
| Pre-flight to `resolvedBaseBranch` | `LUMP-SPLIT`: second pre-flight to execution branch |
| Tick failure isolation | bad lump does not stop daemon |
| `--lumpName` tick | pre-flight to lump `resolvedBaseBranch` only |

---

### 11. Shared mode

| `it()` | Expectation |
| --- | --- |
| Copy at `resolvedBaseBranch` | `LC-SHARED`, lump `baseBranch: ver/0.0.9` |
| Discovery reads source | file on source only |
| No allowlist on run | unlisted `discoveryBranch` still runs |

---

### 12. `clean`

| `it()` | Expectation |
| --- | --- |
| Zero `runProjectPreflight` calls | spy |
| Checkout unchanged | still on `main` after clean |
| Shared copy cleaned | when present |

---

### 13. `lump-plan` / `lump-status`

| `it()` | Expectation |
| --- | --- |
| No pre-flight | spy zero calls |
| Dedicated unlisted `discoveryBranch` | fail |
| Shared unlisted | **success** (no allowlist) |
| Checkout unchanged | before/after branch same |

---

### 14. Schema and cli-types

| `it()` | Expectation |
| --- | --- |
| `localConfig.schema.json` | `discoveryBranch`, `discoveryBranches`; at least one required |
| `lumpConfig.schema.json` | optional `discoveryBranch`; **no** `allowUnlistedBaseBranch` |

---

## E2E scenarios

| ID | Scenario | Expectation |
| --- | --- | --- |
| `DAEMON-MDB-S1` | Dedicated, `LC-MULTI`, two lumps on separate discovery branches | Both markers in one tick |
| `DAEMON-MDB-S2` | `LC-MULTI-ORDER` | Order `ver/0.0.9` before `main` |
| `DAEMON-MDB-S3` | Cross-branch same lumpName | launch succeeds; both run |
| `DAEMON-MDB-S4` | `start --lumpName releaseLine` | only that lump |
| `RUN-MDB-S1` | `run releaseLine` checkout on `main` | succeeds |
| `RUN-MDB-S2` | Dedicated unlisted `discoveryBranch` | `--json` failure |
| `CLEAN-MDB-S1` | Branches on local + remote + copy | clean removes all; checkout unchanged |

Harness: extend `createE2eProject` `localJson` for `discoveryBranches`; `E2eLumpSpec` with `discoveryBranch`, `baseBranch`.

---

## Test implementation details

### New modules

| Path | Export |
| --- | --- |
| `utils/resolveDiscoveryBranches/main.ts` | `resolveDiscoveryBranches`, `resolvePrimaryDiscoveryBranch` |
| `utils/validateLumpDiscoveryBranchAllowlist/main.ts` | dedicated-only allowlist |
| `utils/resolveLumpBranches/main.ts` (optional) | `resolveLumpDiscoveryBranch`, `resolveLumpBaseBranch` |

Barrel-export from `utils/index.ts`. Stubs throw `not implemented` until implementation (red-first).

### Files to update

| File | Action |
| --- | --- |
| `types/LocalConfig.ts`, `localConfig.schema.json` | `discoveryBranch(s)`; remove `projectBaseBranch(s)` from local schema |
| `types/LumpJsConfig.ts`, `lumpConfig.schema.json` | `discoveryBranch`; remove `allowUnlistedBaseBranch` if present |
| `readLocalConfig`, `runProjectPreflight`, `makeLumpWorkspaceFns`, `jsConfigToRunLumpInput` | per sections above |
| `run`, `start`, `clean`, `lump-plan`, `lump-status` | behavior |
| Rename or replace `resolveProjectBaseBranches` → `resolveDiscoveryBranches` in tests/code |

### Assertion snippets

Effective list:

```ts
expect(resolveDiscoveryBranches(localConfig)).toEqual(['main', 'ver/0.0.9']);
```

Allowlist envelope:

```ts
expect(JSON.parse(line!).messages.join(' ')).toMatch(/discoveryBranch|discoveryBranches/i);
```

Cross-branch same name launch:

```ts
// sharedName on main AND ver/0.0.9 — expect success
expect(result.success).toBe(true);
```

---

## Ship checklist

| File | Check |
| --- | --- |
| `DOCS/local-config.md` | `discoveryBranch(s)`, dedicated vs shared |
| `DOCS/lump-config.md` | `baseBranch`, `discoveryBranch`, resolution |
| `DOCS/concepts.md`, `commands.md` | discovery vs execution |
| `AGENTS.md` | workspace facts |

---

## PRD traceability

| PRD # | Criterion | Covered by |
| --- | --- | --- |
| 1 | Effective list | §1, §2 |
| 2 | Parse validation | §2 |
| 3 | Dedicated allowlist; shared none | §4, §7, §8, §13 |
| 4 | Manual `run` | §5, §8 |
| 5 | Daemon duplicate same-branch; cross-branch OK | §9, §10 |
| 6 | `--lumpName` | §9, §10 |
| 7 | Shared | §11 |
| 8 | Teardown | §6 |
| 9 | `clean` | §12 |
| 10 | Docs | Ship checklist |
| 11 | Cross-lump warning | §9 |

## Pass criteria

- All new/updated Vitest tests pass.
- No `packages/core` regression.
- E2E scenarios pass after CLI rebuild.
- `LC-SINGLE` equivalence when `discoveryBranches` omitted.
- Cross-branch same lumpName launch succeeds; unlisted `discoveryBranch` fails in dedicated.
