# Test plan: Multi `projectBaseBranches` (integration-branch-aware runs)

| Field | Value |
| --- | --- |
| **Backlog** | `multi-project-base-branches` · priority **1** |
| **PRD** | [multi-project-base-branches.prd.md](../prds/multi-project-base-branches.prd.md) |
| **Design reference** | [multi-project-base-branches.reference.md](../multi-project-base-branches.reference.md) |
| **Packages** | `packages/apps/cli` (primary); `packages/apps/cli/cli-types` (if `allowUnlistedBaseBranch` needs `defineConfig` typing); `@lumpcode/core` unchanged except preserving existing `getToDoContextList` / `getContextStatus` behavior |
| **Out of scope** | LRU branch scheduling; cross-branch cross-lump dependency resolution; `GetContextListFnInput.baseBranch`; shared-mode multi-branch daemon scan; `project-setup` scaffolding `projectBaseBranches`; npm package cross-links |

## Summary

Verify optional `projectBaseBranches` in `.lumpcode/local.json`, lump `baseBranch` allowlist validation (with `allowUnlistedBaseBranch` opt-out), per-lump pre-flight targeting, dedicated daemon launch fail-fast and branch-ordered ticks, shared-mode execute-on-copy / discover-on-source, workspace teardown on lump resolved `baseBranch`, `clean` without pre-flight across local + shared copy + remote, and cross-lump `baseBranch` mismatch warnings at daemon launch.

**Scope:** ~45–55 `it()` blocks across new util tests, updates to existing CLI unit tests, one new `commands/run/unit.test.ts`, extended `commands/start/unit.test.ts` and `commands/clean/unit.test.ts`, and 4–6 new E2E scenarios in `e2e/daemon-scenarios.test.ts` (plus one shared-mode E2E if harness supports copy path assertions).

### Layering

| Layer | Files | Responsibility |
| --- | --- | --- |
| Config helpers | `resolveProjectBaseBranches/unit.test.ts`, `validateLumpBaseBranchAllowlist/unit.test.ts`, `readLocalConfig/unit.test.ts` | Effective list resolution, parse validation, allowlist |
| Pre-flight / workspace | `runProjectPreflight/unit.test.ts`, `makeLumpWorkspaceFns/unit.test.ts`, `jsConfigToRunLumpInput/unit.test.ts` | `targetBranch`, teardown switch-back |
| Run / plan utils | `runLumpFromJsConfig/unit.test.ts`, `planLumpFromJsConfig/unit.test.ts`, `commands/run/unit.test.ts` | Allowlist, pre-flight order, missing config on checkout |
| Daemon | `commands/start/unit.test.ts`, optional `validateDaemonLaunch/unit.test.ts` | Launch fail-fast, branch-ordered tick, `--lumpName`, warnings |
| Clean | `commands/clean/unit.test.ts` | No pre-flight; local + copy + remote |
| E2E | `e2e/daemon-scenarios.test.ts`, optional `e2e/run-scenarios.test.ts` | Real subprocess multi-branch discovery, clean, shared discovery |

## Test environment

- **Node:** 22+
- **Runner:** Vitest (`npm run test` in `packages/apps/cli`; `packages/core` unchanged)
- **Conventions (from AGENTS.md):** temp `projectRoot`/`tmpDir`; local git `user.name`/`user.email` before commits; real git repos and subprocesses over mocking command handlers; `mkdtemp` + `rm(..., { recursive: true })` teardown; use `cwd` option with `execAsync`/`execSync`, not `cd &&` chains
- **Daemon unit tests:** `setDaemonTestGlobalConfigFolder`, `aliveDaemonSpawnFn`, `waitForDaemonPidFile` from `packages/apps/cli/src/testing/`
- **E2E:** `createE2eProject`, `runE2eCli`, `runForegroundUntilMarkers` from `packages/apps/cli/src/e2e/harness/`; after CLI bundle changes run `build:bundle` + `build:sea` before default SEA E2E

### Commands

```bash
cd packages/apps/cli && npm run test
cd packages/apps/cli && npm run test -- src/utils/resolveProjectBaseBranches/unit.test.ts
cd packages/apps/cli && npm run test:e2e    # after build:bundle + build:sea when CLI changed
```

### Shared test helpers (new)

Add under `packages/apps/cli/src/testing/multiBranchFixtures.ts` (barrel-export from `testing/index.ts`):

| Helper | Purpose |
| --- | --- |
| `initBareRemoteAndCheckout(projectRoot, remoteDir)` | `git init --bare`, checkout with `user.name`/`user.email`, `origin`, initial `main` push |
| `createIntegrationBranch({ projectRoot, remoteDir, branchName, lumpSpecs })` | Create branch from `main`, write `.lumpcode/lumps/<name>/config.json`, commit, push branch to `origin` |
| `writeLocalJson(localConfigFolderPath, config)` | Write `.lumpcode/local.json` |
| `writeMinimalLump(projectRoot, lumpName, configOverrides?)` | Single lump `config.json` on current branch |
| `gitCurrentBranch(cwd)` | `git rev-parse --abbrev-ref HEAD` |
| `assertCheckoutBranch(cwd, expected)` | Fails test if HEAD branch differs |

Branch names in fixtures: `main`, `ver/0.0.9`, `ver/0.0.7` (slash names exercise `shellSingleQuote` in pre-flight).

---

## Test data

### Local config fixtures

| ID | `local.json` body | Notes |
| --- | --- | --- |
| `LC-SINGLE` | `{ "mode": "dedicated", "projectBaseBranch": "main" }` | Effective list `["main"]`; backward compatible |
| `LC-MULTI` | `{ "mode": "dedicated", "projectBaseBranch": "main", "projectBaseBranches": ["main", "ver/0.0.9"] }` | Array wins; singular kept for compat |
| `LC-MULTI-ORDER` | `{ "mode": "dedicated", "projectBaseBranch": "main", "projectBaseBranches": ["ver/0.0.9", "main"] }` | Tick order: `ver/0.0.9` before `main` |
| `LC-SHARED` | `{ "mode": "shared", "projectBaseBranch": "main", "projectBaseBranches": ["main", "ver/0.0.9"] }` | Shared copy + source discovery |
| `LC-EMPTY-ARRAY` | `{ "mode": "dedicated", "projectBaseBranch": "main", "projectBaseBranches": [] }` | Parse fail |
| `LC-DUPES` | `{ "mode": "dedicated", "projectBaseBranch": "main", "projectBaseBranches": ["main", "main"] }` | Parse fail |

### Lump config fixtures

| ID | Key fields | Resolved `baseBranch` | Allowlist |
| --- | --- | --- | --- |
| `LUMP-MAIN` | (no `baseBranch`) | `main` | pass with `LC-MULTI` |
| `LUMP-VER` | `"baseBranch": "ver/0.0.9"` | `ver/0.0.9` | pass with `LC-MULTI` |
| `LUMP-UNLISTED` | `"baseBranch": "ver/0.0.7"` | `ver/0.0.7` | fail unless opt-out |
| `LUMP-OPT-OUT` | `"baseBranch": "ver/0.0.7", "allowUnlistedBaseBranch": true` | `ver/0.0.7` | pass always |

Minimal runnable lump JSON (daemon/E2E):

```json
{
  "contextListJson": { "NAME": "README" },
  "prompt": { "promptTemplate": "E2E @{NAME}", "command": "e2e-agent" }
}
```

### Multi-branch repo layout (dedicated discovery)

After fixture setup on `main`, push integration branch `ver/0.0.9` with:

- `.lumpcode/lumps/releaseLine/config.json` (`LUMP-VER` or default)
- Optional file only on that branch, e.g. `RELEASE_ONLY.txt`, for discovery assertions

Keep `.lumpcode/lumps/mainLine/` on `main` only. **Do not** use the same `lumpName` on both branches except in the duplicate-name launch-fail case.

### Cross-lump dependency warning fixture

On one branch (`main`), two lumps:

- `consumer` — context with `dependsOnContexts: ["provider/ctx"]`
- `provider` — `baseBranch: "ver/0.0.9"` (different from consumer's `main`)

Both lump folders exist on `main` checkout (launch registry sees both). Expect warning text mentioning `provider` and branch mismatch; daemon still starts if no other errors.

### Shared-mode discovery marker

On source `projectRoot` while copy runs at `ver/0.0.9`:

- `getContextListFn` or `contextListJson` tied to a file edited only on source (uncommitted OK)
- Agent command module writes a marker file under branch workspace
- Assert: discovery sees source edit; execution workspace (copy) ends on `origin/ver/0.0.9` after pre-flight

---

## Automated tests

### 1. `resolveProjectBaseBranches` (new util)

**File:** `packages/apps/cli/src/utils/resolveProjectBaseBranches/unit.test.ts`

**Maps to:** PRD acceptance #1, #2

| `it()` | Input | Expectation |
| --- | --- | --- |
| Singular only (`LC-SINGLE`) | `readLocalConfig` result | `["main"]` |
| Array wins (`LC-MULTI`) | both fields set | `["main", "ver/0.0.9"]`; does **not** merge or append singular |
| Array order preserved (`LC-MULTI-ORDER`) | | `["ver/0.0.9", "main"]` exactly |
| `projectBaseBranch` still required when array set | omit singular | `readLocalConfig` fails before helper called |

Export from `utils/index.ts`. Pure function; no I/O.

---

### 2. `readLocalConfig` — `projectBaseBranches` validation

**File:** `packages/apps/cli/src/utils/readLocalConfig/unit.test.ts` (extend)

**Maps to:** PRD acceptance #2

| `it()` | Expectation |
| --- | --- |
| Accepts valid `projectBaseBranches` | success; array on `data` |
| Rejects empty array (`LC-EMPTY-ARRAY`) | `success: false`; message mentions empty or `projectBaseBranches` |
| Rejects duplicates (`LC-DUPES`) | `success: false`; message mentions duplicate |
| Rejects non-string array elements | Zod failure with field path |
| `projectBaseBranch` still required | unchanged existing test |

Update `schemas/localConfig.schema.json` in implementation; add `validateLumpJsonConfig` / schema smoke only if lump schema changes (`allowUnlistedBaseBranch`).

---

### 3. `validateLumpBaseBranchAllowlist` (new util)

**File:** `packages/apps/cli/src/utils/validateLumpBaseBranchAllowlist/unit.test.ts`

**Maps to:** PRD acceptance #3

| `it()` | Expectation |
| --- | --- |
| Listed branch | `success()` |
| Unlisted branch | `failure()` with lump name and branch in message |
| `allowUnlistedBaseBranch: true` | `success()` even when unlisted |
| Effective list from `resolveProjectBaseBranches` | pass `LC-MULTI` + `LUMP-VER` |

Input shape: `{ lumpName, resolvedBaseBranch, effectiveBranches, allowUnlistedBaseBranch? }`.

---

### 4. `runProjectPreflight` — `targetBranch`

**File:** `packages/apps/cli/src/utils/runProjectPreflight/unit.test.ts` (extend)

**Maps to:** PRD acceptance #4, #7; pre-flight primitive unchanged

| `it()` | Expectation |
| --- | --- |
| Default (no `targetBranch`) | dedicated: checkout stays/switches to `local.json` `projectBaseBranch` |
| `targetBranch: 'ver/0.0.9'` | after success, `git rev-parse --abbrev-ref HEAD` at `executionWorkspacePath` is `ver/0.0.9` |
| Missing branch on origin | `failure()` with clear message (lazy existence check) |
| Shared mode + `targetBranch` | copy under `project-copies/<projectName>/` on that branch, source untouched |
| Return payload | include resolved target in output (e.g. `projectBaseBranch` field reflects **target used**, or add `targetBranch` — implementer choice; tests lock behavior) |

Use `createIntegrationBranch` to publish `ver/0.0.9` to bare remote before pre-flight.

---

### 5. `makeLumpWorkspaceFns` — teardown switch-back

**Files:** `makeLumpWorkspaceFns/unit.test.ts`, `jsConfigToRunLumpInput/unit.test.ts`

**Maps to:** PRD acceptance #8

| `it()` | Expectation |
| --- | --- |
| Teardown uses lump resolved `baseBranch` | When `makeLumpWorkspaceFns({ projectBaseBranch: 'main', lumpBaseBranch: 'ver/0.0.9' })` (or equivalent wiring), teardown command contains `git switch ver/0.0.9`, **not** `git switch main` |
| Checkout + worktree strategies | both strategies covered (mirror existing describe blocks) |
| **Update** `jsConfigToRunLumpInput` test `teardown always returns to projectBaseBranch (not the lump-level baseBranch)` | Invert expectation: teardown switches to `release/2.0` when lump `baseBranch` is `release/2.0` |

---

### 6. `runLumpFromJsConfig` / `planLumpFromJsConfig` — allowlist

**Files:** `runLumpFromJsConfig/unit.test.ts`, `planLumpFromJsConfig/unit.test.ts`

**Maps to:** PRD acceptance #3; reference doc `lump-plan` validates allowlist

| `it()` | Expectation |
| --- | --- |
| `runLumpFromJsConfig` unlisted `baseBranch` | `failure()` before `runLump` mock called; pass `effectiveBranches` or `localConfig` into util |
| `runLumpFromJsConfig` opt-out | proceeds to `runLump` |
| `planLumpFromJsConfig` unlisted | `failure()` with allowlist message |
| `planLumpFromJsConfig` listed | success plan preview (no pre-flight — no git switch) |

---

### 7. `run` command — order and guards

**File:** `packages/apps/cli/src/commands/run/unit.test.ts` (**new**)

**Maps to:** PRD acceptance #3, #4, #7

Use `handlerMaker({ projectRoot, localConfigFolderPath, globalConfigFolderPath })` with real temp git repo; mock **only** `runLumpFromJsConfig` via `vi.spyOn` on utils barrel if needed, **or** stub agent with echo command and minimal lump (prefer integration-style like other command tests).

| `it()` | Expectation |
| --- | --- |
| Missing lump on current checkout | fail before pre-flight; message indicates lump not found locally |
| Unlisted `baseBranch` | fail before pre-flight; allowlist message |
| Listed lump on `ver/0.0.9` | with checkout on `main` and `LC-MULTI`, pre-flight switches execution workspace to `ver/0.0.9` then run succeeds |
| Pre-flight before config load order | spy `runProjectPreflight` and `getJsConfigFromLumpName`: config load happens **before** pre-flight; pre-flight receives `targetBranch` from resolved lump `baseBranch` |
| `allowUnlistedBaseBranch: true` | run proceeds |

Dedicated mode: after run, `executionWorkspacePath` HEAD is lump `baseBranch`.

---

### 8. `start` command — dedicated daemon launch validation

**File:** `packages/apps/cli/src/commands/start/unit.test.ts` (extend)

**Maps to:** PRD acceptance #5, #6, #11

Use foreground daemon with short cron or direct `runTick` injection if exposed; otherwise `aliveDaemonSpawnFn` + read log file.

| `it()` | Expectation |
| --- | --- |
| Multi-branch launch success | `LC-MULTI`, lumps `mainLine` on `main` and `releaseLine` on `ver/0.0.9`; `start --foreground` succeeds |
| Duplicate `lumpName` across branches | same `lumpName` on `main` and `ver/0.0.9`; launch **fails**; error lists duplicate; scheduler not started (no PID file) |
| Unlisted lump at launch | lump `baseBranch: ver/0.0.7` without opt-out; launch fails |
| Unloadable config at launch | invalid `config.json` on a branch; launch fails; error aggregated |
| Cross-lump `baseBranch` mismatch warning | consumer/provider fixture; launch **succeeds**; log/meta contains warning substring |
| `start --lumpName` not in list | lump on `ver/0.0.7`, list `["main"]`; launch fails |
| `start --lumpName` in list | lump `baseBranch: ver/0.0.9` in list; launch succeeds; **no** full multi-branch registry scan (spy `discoverLoadableLumpNames` call count or branch loop) |
| Shared mode + `projectBaseBranches` | launch succeeds; **no** per-branch discovery loop (single pre-flight path — same as today) |

---

### 9. `start` command — dedicated daemon tick shape

**File:** `packages/apps/cli/src/commands/start/unit.test.ts` or extracted `validateDaemonLaunch` / tick helper tests

**Maps to:** PRD acceptance #5, #6

| `it()` | Expectation |
| --- | --- |
| Branch order in one tick | `LC-MULTI-ORDER`, instrument `runProjectPreflight` or git reflog: pre-flight order is `ver/0.0.9` then `main` |
| All lumps per branch | lumps A+B on `main`, lump C on `ver/0.0.9`; one tick runs A, B, then C (or C after second pre-flight) — assert via mock agent markers or `runLump` spy call order |
| Tick-time lump failure does not crash daemon | one lump throws / returns failure; next lump and next tick still run (extend pattern from existing disabled-lump tests) |
| `start --lumpName` tick | only pre-flight to lump branch; other branch lumps not run |
| `lockMode: 'wait'` | retained on `runLumpFromJsConfig` from daemon (spy optional regression) |

---

### 10. Shared mode — discovery vs execution

**Files:** `commands/run/unit.test.ts` and/or `runProjectPreflight/unit.test.ts` + optional E2E

**Maps to:** PRD acceptance #7

| `it()` | Expectation |
| --- | --- |
| Pre-flight targets copy at lump `baseBranch` | `LC-SHARED`, lump `baseBranch: ver/0.0.9`; copy HEAD is `ver/0.0.9`; source may remain on `main` |
| Discovery reads source | `getContextListFn` lists file present only on source tree (committed on source `main`); not gated on copy branch |
| Documented intentionally | no test that "fixes" discovery to use copy |

Optional E2E `RUN-SHARED-MULTI`: `createE2eProject({ localJson: { mode: 'shared', projectBaseBranches: [...] }, lumps: [...] })`.

---

### 11. `clean` command — no pre-flight

**File:** `packages/apps/cli/src/commands/clean/unit.test.ts` (extend)

**Maps to:** PRD acceptance #9

| `it()` | Expectation |
| --- | --- |
| Does not call `runProjectPreflight` | `vi.spyOn(runProjectPreflight)` — zero calls |
| Does not switch integration branch | create lump branches, leave checkout on `main`; after clean, still on `main` |
| Cleans remote + local | existing tests keep passing |
| Cleans shared copy when present | `LC-SHARED`, seed copy with lump branches; `clean` deletes branches on copy path under `globalConfigFolderPath/project-copies/` |
| `projectBaseBranches` irrelevant | clean works with `LC-MULTI` without parsing effective list for switch |
| Worktrees removed | existing worktree test still passes |

---

### 12. `lump-plan` / `lump-status` — non-destructive

**Files:** `commands/lump-plan/unit.test.ts`, `commands/lump-status/unit.test.ts` (extend)

**Maps to:** PRD non-goals; reference doc

| `it()` | Expectation |
| --- | --- |
| No pre-flight | spy `runProjectPreflight` — zero calls |
| `lump-plan` allowlist failure | unlisted `baseBranch` fails with clear message |
| Checkout unchanged | `gitCurrentBranch` before/after identical |

---

### 13. Schema and cli-types

**Files:** `validateLumpJsonConfig/unit.test.ts`, `packages/apps/cli/src/schemas/*.json`

| `it()` | Expectation |
| --- | --- |
| `localConfig.schema.json` | optional `projectBaseBranches` array of strings |
| `lumpConfig.schema.json` | optional `allowUnlistedBaseBranch` boolean |
| Invalid types rejected | consistent with Zod |

---

## E2E scenarios (subprocess)

**File:** `packages/apps/cli/src/e2e/daemon-scenarios.test.ts` (extend) and/or new `e2e/multi-base-branches.test.ts`

| ID | Scenario | Expectation |
| --- | --- | --- |
| `DAEMON-MBB-S1` | Dedicated global daemon, `LC-MULTI`, `mainLine` + `releaseLine` on separate branches | Foreground tick creates markers for both lumps |
| `DAEMON-MBB-S2` | `LC-MULTI-ORDER` | Log or side-effect order shows `ver/0.0.9` lump before `main` lump in same tick |
| `DAEMON-MBB-S3` | Duplicate lump name on two branches | `start --json` failure; daemon not running |
| `DAEMON-MBB-S4` | `start --lumpName releaseLine` | only `releaseLine` marker; `mainLine` remote branch absent |
| `RUN-MBB-S1` | `lumpcode run releaseLine` with checkout on `main` | run succeeds; marker on remote |
| `CLEAN-MBB-S1` | lump branches on local + remote + shared copy | `clean` removes all; checkout branch unchanged |
| `RUN-MBB-S2` | Unlisted `baseBranch` | `run --json` failure envelope |

Harness changes:

- Extend `createE2eProject` `localJson` to accept `projectBaseBranches`
- Extend `E2eLumpSpec` with `baseBranch`, `allowUnlistedBaseBranch`
- Add `pushIntegrationBranch(project, branchName, mutateFn)` helper to build branch-only lumps without manual git in each test

---

## Test implementation details

### New modules (stubs until implementation — red-first per AGENTS.md)

| Path | Export |
| --- | --- |
| `utils/resolveProjectBaseBranches/main.ts` | `resolveProjectBaseBranches(localConfig): string[]` |
| `utils/validateLumpBaseBranchAllowlist/main.ts` | `validateLumpBaseBranchAllowlist(...): Success<void> \| Failure<string>` |

Barrel-export from `utils/index.ts`.

### Files to create

| File | Action |
| --- | --- |
| `utils/resolveProjectBaseBranches/main.ts` + `index.ts` + `unit.test.ts` | §1 |
| `utils/validateLumpBaseBranchAllowlist/main.ts` + `index.ts` + `unit.test.ts` | §3 |
| `commands/run/unit.test.ts` | §7 |
| `testing/multiBranchFixtures.ts` | Shared git fixtures |

### Files to update

| File | Action |
| --- | --- |
| `types/LocalConfig.ts`, `schemas/localConfig.schema.json` | `projectBaseBranches` |
| `types/LumpJsConfig.ts`, `schemas/lumpConfig.schema.json`, cli-types | `allowUnlistedBaseBranch` |
| `utils/readLocalConfig/main.ts` + `unit.test.ts` | Zod rules §2 |
| `utils/runProjectPreflight/main.ts` + `unit.test.ts` | `targetBranch` §4 |
| `utils/makeLumpWorkspaceFns/main.ts` + `unit.test.ts` | lump base for teardown §5 |
| `utils/jsConfigToRunLumpInput/main.ts` + `unit.test.ts` | pass lump `baseBranch` into workspace fns §5 |
| `utils/runLumpFromJsConfig/main.ts` + `unit.test.ts` | allowlist §6 |
| `utils/planLumpFromJsConfig/main.ts` + `unit.test.ts` | allowlist §6 |
| `commands/run/main.ts` | reorder: config → allowlist → pre-flight §7 |
| `commands/start/main.ts` | launch validation + branch loop §8–9 |
| `commands/clean/main.ts` + `unit.test.ts` | drop pre-flight §11 |
| `commands/lump-plan/main.ts`, `lump-status` path | allowlist only §12 |
| `e2e/harness/createE2eProject.ts` | multi-branch helpers §E2E |
| `e2e/daemon-scenarios.test.ts` | §E2E |

### Assertion snippets

Effective list:

```ts
import { resolveProjectBaseBranches } from '../../utils/resolveProjectBaseBranches';

expect(resolveProjectBaseBranches(localConfig)).toEqual(['main', 'ver/0.0.9']);
```

Pre-flight branch:

```ts
import { execSync } from 'node:child_process';

const head = execSync('git rev-parse --abbrev-ref HEAD', {
    cwd: executionWorkspacePath,
    encoding: 'utf-8',
}).trim();
expect(head).toBe('ver/0.0.9');
```

CLI JSON envelope:

```ts
const line = stdout.trim().split('\n').find((l) => l.startsWith('{'));
expect(JSON.parse(line!).success).toBe(false);
expect(JSON.parse(line!).messages.join(' ')).toMatch(/allowlist|projectBaseBranches/i);
```

Spy pre-flight not called (`clean`):

```ts
const spy = vi.spyOn(runProjectPreflightModule, 'runProjectPreflight');
// ... invoke clean handler ...
expect(spy).not.toHaveBeenCalled();
spy.mockRestore();
```

### Daemon launch duplicate-name setup

```ts
await createIntegrationBranch({
    projectRoot,
    remoteDir,
    branchName: 'ver/0.0.9',
    lumpSpecs: [{ name: 'sameName', configJson: minimalLump }],
});
// main already has .lumpcode/lumps/sameName from prior commit on main
const result = await startHandler({ options: { foreground: true, cronSetup: '*/1 * * * *' }, arguments: {} });
expect(result.success).toBe(false);
```

---

## Ship checklist (not Vitest)

Complete before moving backlog entry to `DONE.yml`.

### Docs — PRD acceptance #10

| File | Check |
| --- | --- |
| `packages/apps/cli/DOCS/local-config.md` | `projectBaseBranches`, precedence, validation, shared execute/discover |
| `packages/apps/cli/DOCS/lump-config.md` | allowlist, `allowUnlistedBaseBranch`, cross-lump deps on demanding branch |
| `packages/apps/cli/DOCS/concepts.md` | integration-branch allowlist, three workspaces |
| `packages/apps/cli/DOCS/commands.md` | daemon launch/tick, `clean` without pre-flight |
| `AGENTS.md` | workspace facts match shipped behavior |

### Schemas

- `localConfig.schema.json` and `lumpConfig.schema.json` published under `packages/apps/cli/src/schemas/` and copied to `dist/schemas/` / SEA `bin/schemas/`

### Manual smoke (optional)

- Dedicated daemon with two real integration branches in dogfood repo
- `lumpcode clean` while on wrong branch — lump branches still removed

---

## PRD traceability

| PRD # | Acceptance criterion | Covered by |
| --- | --- | --- |
| 1 | Effective list — array wins; singular-only unchanged | §1, §2, `LC-SINGLE` / `LC-MULTI` |
| 2 | Parse validation — empty array, duplicates | §2 |
| 3 | Allowlist — run + daemon launch; opt-out | §3, §6, §7, §8, §12 |
| 4 | Manual `run` — pre-flight to lump branch; config from checkout only | §4, §7, `RUN-MBB-S1` |
| 5 | Dedicated daemon — duplicate name fail; tick branch order; tick skip bad lump | §8, §9, `DAEMON-MBB-S1`–`S3` |
| 6 | `start --lumpName` — launch verify; tick single branch | §8, §9, `DAEMON-MBB-S4` |
| 7 | Shared mode — discover source, execute copy at lump branch | §4, §10, optional `RUN-SHARED-MULTI` |
| 8 | Workspace teardown — lump resolved `baseBranch` | §5 |
| 9 | `clean` — no pre-flight; all workspaces | §11, `CLEAN-MBB-S1` |
| 10 | Docs + schemas | Ship checklist |
| 11 | Cross-lump warning at daemon launch | §8, warning fixture |

---

## Pass criteria

- All new and updated Vitest tests in `packages/apps/cli` pass.
- No regression in `packages/core` test suite.
- E2E: new `DAEMON-MBB-*` and `RUN-MBB-*` / `CLEAN-MBB-*` scenarios pass on CI matrix after CLI rebuild.
- Ship checklist complete.
- Singular `projectBaseBranch` installs behave as before when `projectBaseBranches` is omitted (`LC-SINGLE` equivalence).
