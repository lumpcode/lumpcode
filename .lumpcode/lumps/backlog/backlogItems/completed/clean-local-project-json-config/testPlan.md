# Test plan: clean-local-project-json-config

| Field | Value |
| --- | --- |
| **Backlog** | `clean-local-project-json-config` |
| **Kind** | Feature — `project.json` / `local.json` field membership, merge (local wins), lump defaults overlay, Zod-inferred resolved type, `project-setup` scaffold |
| **Primary packages under test** | `@lumpcode/cli` only (`packages/apps/cli`) |
| **Not under test** | `@lumpcode/core` APIs; `@lumpcode/cli-types` / `@lumpcode/cli-utils` / `@lumpcode/recipes` public exports; live agents; docs/editor-schema prose content (implementation checklist); migration of existing installs |

Source of truth: [requirements.md](./requirements.md). This plan is the source of truth for the `testImpl` stage.

---

## 1. Goals of the test suite

Prove that after implementation:

1. **Field membership** — `project.json` and `local.json` each accept only their allowlisted keys; misplaced known keys and unknown keys hard-fail at file read with clear errors.
2. **Primary branch on merge** — per-file primary is optional; after merge, a non-empty primary source is required (`primaryBranches` non-empty, or `primaryBranch`, or deprecated `projectBaseBranch`); either file may supply it; missing from both fails naming both files.
3. **Merge (local wins)** — shared keys present on both layers resolve to the local value; keys only on one layer use that layer; omitted `workspaceStrategy` defaults to `checkout` on the resolved object.
4. **Lump defaults** — `command`, `maximumNumberOfConcurrentBranches`, `keepHistory`, `verbose` overlay with **lump > local > project** where the field exists on that layer; inherit only when the lump value is `undefined`; `false` / `0` are not overridden; `verbose` never comes from project.
5. **`command` on project/local** — path-shaped values (no whitespace, ends with `.ts` or `.js`) hard-fail at read; tag strings accept without on-disk existence checks.
6. **Canonical owners** — merge + merged primary validation only in `readProjectLocalConfig`; lump-default overlay only in `applyLumpConfigDefaults`; `getProjectName` validates via `readProjectJson` (strict membership).
7. **Call paths** — `run` / `start` / `lump-plan` / `lump-status` consume the same merged surface and apply lump defaults before branch-cap / plan / status surfaces that reflect effective lump fields; daemon freezes one `readProjectLocalConfig` result at start.
8. **`project-setup`** — writes `{ projectName, primaryBranch }` to `project.json` and `{ mode }` only to `local.json`; does not rewrite existing installs.
9. **Branch cap** — when the lump omits `maximumNumberOfConcurrentBranches`, the value from project/local is enforced by skip evaluation (same as today’s lump-level field).
10. **Types** — `ResolvedProjectLocalConfig` is `z.infer` of the resolved Zod schema; file shapes are `Pick`s from it (compile/type assert where cheap).

Docs (`local-config.md`, `project-config.md`, …) and editor schemas (`localConfig.schema.json`, new `projectConfig.schema.json`) are **implementation-stage acceptance**, not automated in `testImpl`.

---

## 2. Testing approach

| Level | Required? | Mechanism |
| --- | --- | --- |
| **Unit (file readers + merge + defaults)** | Yes — primary | Temp dirs + `fs.writeFile` JSON; no git/daemon |
| **Unit (project-setup scaffold)** | Yes | Existing `project-setup/unit.test.ts` rewrite of written shapes |
| **Unit / integration (wiring + branch cap)** | Yes | Existing `runLumpFromLumpName` / `runLumpFromJsConfig` / `planLumpFromJsConfig` / `lump-status` fixtures; spy or assert effective `jsConfig` / skip reason |
| **Unit (`resolvePrimaryBranches`)** | Yes — light | Feed merged primary fields (or `ResolvedProjectLocalConfig` Pick) into existing helper; keep deprecate-warn case |
| **E2E** | Yes — thin | Fresh `project-setup` file shapes; one run with `command` only on `project.json` + mock agent; optional local primary override |

### Prefer update over new when a host exists

| Host (today) | Becomes |
| --- | --- |
| `readLocalConfig/unit.test.ts` | Drop “primary required on local alone”; add membership / new fields / path-`command` (**L***) |
| `getProjectName/unit.test.ts` | Strict unknown / misplaced keys via `readProjectJson` (**N***) |
| `project-setup/unit.test.ts` | New scaffold expectations (**S***) |
| `resolvePrimaryBranches/unit.test.ts` | Still green when primary fields come from merged `T` (**R***) |
| `runLumpFromJsConfig/unit.test.ts` | Cap from project/local when lump omits (**C***) |
| `runLumpFromLumpName` / plan / status suites | Merged config + defaults on load paths (**W***) |
| Fixtures `writeLocalJson` / `createE2eProject` / start helpers | Primary may live on `project.json` when local is mode-only (**F***) |

### Prefer real fixtures over mocks

- File parse / merge / defaults: real temp JSON files under `os.tmpdir()`.
- Branch-cap / run wiring: existing temp git fixtures; spy `runLump` / mock agent only where today’s suites already do.
- Do **not** inject alternate merge implementations in command handlers — call the real `readProjectLocalConfig` / `applyLumpConfigDefaults`.

### Red → green during `testImpl` (skip both new and updated)

1. Write/extend all cases against the **post-implementation** contract.
2. Mark **every** case for this item with `it.skip` / `describe.skip` during `testImpl` — both **new** tests **and** **updated** hosts — so the suite stays green while product code is unchanged.
3. Add index-barrel-exported stubs (throwing `not implemented`) for new utils (`readProjectJson`, `readProjectLocalConfig`, `applyLumpConfigDefaults`) plus types the tests import (`ResolvedProjectLocalConfig`, `ProjectJsonConfig`, `LocalJsonConfig`) so imports compile and unit tests run red once unskipped.
4. During **implementation**, unskip as behavior lands (or unskip all when complete). Do not leave updated hosts permanently skipped.
5. Do **not** change production merge/defaults behavior in `testImpl` to green the suite.

---

## 3. File layout (implementation details)

| Path | Role |
| --- | --- |
| `packages/apps/cli/src/utils/readProjectJson/{main,index,unit.test}.ts` | **Add** — strict project file parse (**P***). Stub + barrel from `utils/index.ts` |
| `packages/apps/cli/src/utils/readProjectLocalConfig/{main,index,unit.test}.ts` | **Add** — merge + resolved Zod + merged primary (**M***). Stub + barrel |
| `packages/apps/cli/src/utils/applyLumpConfigDefaults/{main,index,unit.test}.ts` | **Add** — lump-default overlay (**D***). Stub + barrel |
| `packages/apps/cli/src/utils/readLocalConfig/{main,unit.test}.ts` | **Update** — local allowlist; drop per-file primary requirement; path-`command` reject (**L***) |
| `packages/apps/cli/src/utils/getProjectName/{main,unit.test}.ts` | **Update** — route through `readProjectJson` (**N***) |
| `packages/apps/cli/src/types/` (`ResolvedProjectLocalConfig`, `ProjectJsonConfig`, `LocalJsonConfig`; alias/remove old `LocalConfig` / `ProjectConfig`) | **Update** — Zod-inferred + `Pick` (**T*** type cases may live next to schema module) |
| `packages/apps/cli/src/utils/resolvePrimaryBranches/{main,unit.test}.ts` | **Update** — accept merged primary fields / `T` (**R***) |
| `packages/apps/cli/src/commands/project-setup/{main,unit.test}.ts` | **Update** — scaffold shapes (**S***) |
| `packages/apps/cli/src/utils/runLumpFromJsConfig/unit.test.ts` | **Update** — branch cap from project/local (**C***) |
| `packages/apps/cli/src/utils/runLumpFromLumpName/unit.test.ts` | **Update** — defaults applied before phase 2 / cap (**W***, **C***) |
| `packages/apps/cli/src/utils/planLumpFromJsConfig/unit.test.ts` | **Update** — effective defaults on plan path (**W***) |
| `packages/apps/cli/src/commands/lump-status/unit.test.ts` (or equivalent load path) | **Update** — same defaults surface (**W***) |
| `packages/apps/cli/src/commands/start/testing/` + `start/main` consumers | **Update** — freeze `readProjectLocalConfig`; fixtures with project primary (**F***, **W***) |
| `packages/apps/cli/src/testing/multiBranchFixtures.ts` (+ `createE2eProject` / start `testHelpers`) | **Update** — helpers write primary on project and/or local so mode-only local still works (**F***) |
| `packages/apps/cli/src/e2e/` (new thin file or extend existing setup scenario) | **Add/Update** — scaffold + inherited `command` (**E***) |

If path-shaped `command` detection is a tiny private helper shared by project/local Zod, keep it private (or one util only if ≥2 call sites need it outside schemas). Prefer a Zod refine colocated with the schemas over a new util directory for a one-liner.

Run:

```bash
npm run test -w=@lumpcode/cli
# after e2e cases land:
npm run test:e2e:node -w=@lumpcode/cli   # or package script used today for node e2e
```

---

## 4. Shared test data / fixtures

### 4.1 Minimal valid pair (merged happy path)

`project.json`:

```json
{
  "projectName": "demo",
  "primaryBranch": "dev",
  "command": "cursor",
  "maximumNumberOfConcurrentBranches": 2,
  "keepHistory": true
}
```

`local.json`:

```json
{
  "mode": "dedicated",
  "workspaceStrategy": "worktree",
  "maxParallelRun": 3,
  "verbose": true
}
```

Expected `ResolvedProjectLocalConfig` (conceptually): mode/strategy/disabled/maxParallel from local; `projectName` from project; primary from project (`dev`); lump-default fields from project (`command`, cap, `keepHistory`) plus local `verbose`; `workspaceStrategy: "worktree"`.

### 4.2 Local wins shared primary

| project.json | local.json | Expected merged primary source |
| --- | --- | --- |
| `"primaryBranch": "dev"` | `"primaryBranch": "main"` | `main` (local) |
| `"primaryBranches": ["dev","main"]` | `"primaryBranch": "main"` | local singular wins for shared key presence — document exact field presence: whichever shared keys local sets replace project’s same keys; unresolved list via `resolvePrimaryBranches` on merged object |
| omit primary | `"primaryBranches": ["main"]` | local array OK |
| `"primaryBranch": "dev"` | omit primary | project OK |
| omit all primary fields | omit all primary fields | Failure; message mentions both `project.json` and `local.json` |
| `"projectBaseBranch": "legacy"` only | omit | Success; deprecate warn when `resolvePrimaryBranches` called with logger |

### 4.3 Membership violation samples

| File | Payload | Expect |
| --- | --- | --- |
| project | `{ "projectName": "x", "mode": "shared" }` | Fail; mention `mode` |
| project | `{ "projectName": "x", "verbose": true }` | Fail; mention `verbose` |
| project | `{ "projectName": "x", "disabled": true }` | Fail |
| project | `{ "projectName": "x", "unknownKey": 1 }` | Fail |
| local | `{ "mode": "shared", "projectName": "x", "primaryBranch": "main" }` | Fail; mention `projectName` |
| local | `{ "mode": "shared", "extra": true, "primaryBranch": "main" }` | Fail |
| local | `{ "mode": "shared" }` alone (no primary on either file) | `readLocalConfig` **succeeds**; `readProjectLocalConfig` **fails** merged primary |

### 4.4 `command` samples (project/local)

| Value | Expect at file read |
| --- | --- |
| `"cursor"`, `"copilot"`, `"claude-code"` | Accept |
| `"./agent.ts"`, `"commands/foo.js"`, `"my-agent.ts"` | Fail (path-shaped) |
| `"use cursor.js carefully"` (has whitespace) | Accept as non-path string at read (tag-shape rule only rejects no-whitespace + `.ts`/`.js`); later resolve may fail — assert read accepts |
| missing tag that is not path-shaped | Accept at read |

Reuse the same path rule as lump file-ref command detection: entire string has no whitespace and ends with `.ts` or `.js`.

### 4.5 Lump default overlay matrix

Base resolved:

```ts
const resolved = {
  projectName: 'demo',
  mode: 'shared',
  workspaceStrategy: 'checkout',
  primaryBranch: 'main',
  command: 'cursor', // from project
  maximumNumberOfConcurrentBranches: 2,
  keepHistory: true,
  verbose: true, // from local only in real fixtures
};
```

| Lump `jsConfig` fields | Expected after `applyLumpConfigDefaults` |
| --- | --- |
| omit all four defaults | `command: 'cursor'`, cap `2`, `keepHistory: true`, `verbose: true` (when local supplied verbose) |
| `command: 'copilot'` | keeps `copilot` |
| `keepHistory: false` | stays `false` (not overridden) |
| `maximumNumberOfConcurrentBranches: 0` | stays `0` |
| `verbose: false` | stays `false` |
| `command: undefined` (explicit) | inherits local then project |
| project has `verbose` only if wrongly present | N/A — project read fails; overlay never reads project `verbose` |

### 4.6 Branch-cap fixture

- Remote open lump branches ≥ N (reuse existing `runLumpFromJsConfig` open-branch helpers).
- Lump config **omits** `maximumNumberOfConcurrentBranches`.
- `project.json` (or local) sets `"maximumNumberOfConcurrentBranches": 2`.
- After load + defaults, skip evaluation matches today’s too-many-open-branches skipped variant.

### 4.7 `project-setup` expected files

| File | Contents |
| --- | --- |
| `.lumpcode/project.json` | `{ "projectName": "<…>", "primaryBranch": "<--primaryBranch or main>" }` only (no other keys required) |
| `.lumpcode/local.json` | `{ "mode": "shared" \| "dedicated" }` only — **no** `primaryBranch`, **no** `workspaceStrategy` |

Still gitignore `local.json`. Existing-already-initialized failure unchanged.

### 4.8 Fixture helper updates (**F***)

When local is mode-only, helpers that previously relied on `writeLocalJson({ mode, primaryBranch })` must either:

- keep writing primary on local (still valid), **or**
- write `primaryBranch` on `project.json` and mode-only (or mode+strategy) local.

Prefer a small `writeProjectJson(localConfigFolderPath, partial)` helper in `packages/apps/cli/src/testing/` (barrel-exported) if ≥2 suites need it; otherwise inline `fs.writeFile` in the few updated tests. Update `createE2eProject` so optional `projectJson` merge exists and default remains `{ projectName }` plus whatever primary the suite needs (e2e may keep primary on local until scaffold e2e asserts the new split).

---

## 5. Test cases

Each case: **ID**, **setup/data**, **expectation**, **where**.

### 5.1 `readProjectJson` (**P** — new)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| P1 | Valid minimal | `{ "projectName": "demo" }` | Success; `projectName: "demo"` |
| P2 | Valid with shared + lump-default fields | §4.1 project fragment | Success; fields present; no local-only keys |
| P3 | Missing file | no `project.json` | Failure; message mentions missing `project.json` / `project-setup` |
| P4 | Invalid JSON | `not json` | Failure; invalid JSON |
| P5 | Missing / empty `projectName` | `{}` / `{ "projectName": "  " }` | Failure |
| P6 | Invalid `projectName` chars | `"My Project"` | Failure; letters/digits/`_`/`-` rule |
| P7 | Unknown key | `{ "projectName": "x", "foo": 1 }` | Failure; unknown / unrecognized key |
| P8 | Misplaced `mode` | `{ "projectName": "x", "mode": "shared" }` | Failure; mentions `mode` |
| P9 | Misplaced `verbose` / `disabled` / `maxParallelRun` / `workspaceStrategy` | each in turn | Failure |
| P10 | Path-shaped `command` | `"command": "./agent.ts"` | Failure |
| P11 | Tag `command` | `"command": "cursor"` | Success; no existence check (tag need not be installed) |
| P12 | `keepHistory` / cap types | non-boolean / non-number | Failure |
| P13 | Empty `primaryBranches` | `"primaryBranches": []` | Failure (same non-empty array rule as today on local) |
| P14 | Duplicate `primaryBranches` | `["main","main"]` | Failure |

**Where:** `packages/apps/cli/src/utils/readProjectJson/unit.test.ts` (new; `describe.skip` / stub until implementation).

### 5.2 `readLocalConfig` (**L** — update)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| L1 | Mode-only succeeds | `{ "mode": "shared" }` | Success; `workspaceStrategy` default **not** required here if default moves to merge-only — match requirements: default `checkout` after merge; local reader may still default or leave undefined; **document chosen behavior in test** and keep merge (**M5**) as the AC for default. Prefer: local reader does not require primary; apply `workspaceStrategy` default either in local reader (today) **or** only in `readProjectLocalConfig` — pick one implementation and assert **M5** as the resolved contract. |
| L2 | Accepts lump-default fields | `command`, `maximumNumberOfConcurrentBranches`, `keepHistory`, `verbose` + mode (+ optional primary) | Success |
| L3 | Rejects `projectName` | mode + `projectName` | Failure |
| L4 | Unknown key | mode + `extra` | Failure (`.strict()`) |
| L5 | Path-shaped `command` | `"command": "foo.js"` | Failure |
| L6 | Tag `command` | `"command": "copilot"` | Success |
| L7 | Existing valid cases | mode + primary / primaryBranches / disabled / maxParallelRun / workspaceStrategy | Stay green (update any case that required primary-only-on-local as the sole primary source for **file** validity) |
| L8 | Remove / invert old test | former “fails when primaryBranch missing” | Now **succeeds** for mode-only (replace expectation) |
| L9 | Invalid `verbose` type | `"verbose": "yes"` | Failure |

**Where:** `packages/apps/cli/src/utils/readLocalConfig/unit.test.ts` (`it.skip` / updated cases under skip during `testImpl`).

### 5.3 `readProjectLocalConfig` (**M** — new)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| M1 | Local wins shared primary | project `primaryBranch: "dev"`, local `primaryBranch: "main"` + mode | Success; resolved `primaryBranch === "main"` |
| M2 | Primary only on project | project has primary; local mode-only | Success |
| M3 | Primary only on local | project name-only; local has primary | Success |
| M4 | Primary missing both | name-only project + mode-only local | Failure; message references both files / primary required after merge |
| M5 | `workspaceStrategy` default | omit on local | Resolved `workspaceStrategy === "checkout"` |
| M6 | Local strategy wins | local `worktree` | Resolved `worktree` |
| M7 | Local wins shared lump-default keys | project `command: "cursor"`, local `command: "copilot"` | Resolved `command === "copilot"` |
| M8 | Project-only `projectName` | always from project | Resolved `projectName` matches project file |
| M9 | Local-only fields | `disabled`, `maxParallelRun`, `mode` | Present from local; absent from project layer |
| M10 | Propagates file Failure | invalid project or local | Failure; does not swallow underlying message |
| M11 | Deprecated `projectBaseBranch` only on project | project has legacy alias only | Merge success; primary resolvable via `resolvePrimaryBranches` |
| M12 | `primaryBranches` non-empty on project, singular on local | local sets singular only | Local’s present shared keys win; resolved object reflects local singular (and may omit array if local did not set it) — assert exact merge semantics: **per-key** local-wins, not whole-primary-group replace |

**Where:** `packages/apps/cli/src/utils/readProjectLocalConfig/unit.test.ts` (new).

### 5.4 `applyLumpConfigDefaults` (**D** — new)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| D1 | All undefined on lump | omit four keys | All four filled from resolved (verbose only if on resolved) |
| D2 | Lump `command` set | lump `command: "copilot"`, resolved `command: "cursor"` | Result `copilot` |
| D3 | Lump `keepHistory: false` | resolved `true` | Result `false` |
| D4 | Lump cap `0` | resolved `2` | Result `0` |
| D5 | Lump `verbose: false` | resolved `true` | Result `false` |
| D6 | Explicit `undefined` inherits | `{ command: undefined }` after load simulation | Inherits local then project |
| D7 | Precedence local over project | resolved already local-wins; lump omit | Uses resolved value (no re-read of files) |
| D8 | Does not deep-merge / touch other keys | lump `baseBranch`, steps, etc. | Unchanged |
| D9 | No project verbose backdoor | resolved without `verbose`; lump omit | Result `verbose` stays `undefined` |
| D10 | Pure function | same inputs twice | Same output; does not mutate input `jsConfig` (assert original unchanged) |

**Where:** `packages/apps/cli/src/utils/applyLumpConfigDefaults/unit.test.ts` (new).

### 5.5 Types from Zod (**T** — light)

| ID | Case | Expectation |
| --- | --- | --- |
| T1 | `ResolvedProjectLocalConfig` equals `z.infer<typeof resolvedProjectLocalConfigSchema>` | `expectTypeOf` equal |
| T2 | `ProjectJsonConfig` / `LocalJsonConfig` are `Pick`s of resolved fields listed in requirements | Assignability both ways for shared field types (`primaryBranch`, `command`, …) — same property types |
| T3 | Old `LocalConfig` / `ProjectConfig` names | Removed or type-aliased to new names; call sites compile |

**Where:** colocated `*.types.test.ts` next to the schema module **or** short `expectTypeOf` blocks in `readProjectLocalConfig/unit.test.ts`. Skip during `testImpl` with stubs exporting `any` / loose types so assertions fail until real Zod lands.

### 5.6 `getProjectName` (**N** — update)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| N1 | Happy path | valid project.json | Success trimmed name (existing) |
| N2 | Unknown key | `{ "projectName": "x", "foo": 1 }` | Failure (strict) |
| N3 | Misplaced `mode` | project with `mode` | Failure |
| N4 | Path `command` | project with path command | Failure |
| N5 | Existing invalid name cases | spaces / missing | Stay failing |

**Where:** `packages/apps/cli/src/utils/getProjectName/unit.test.ts`.

### 5.7 `resolvePrimaryBranches` (**R** — update)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| R1 | Merged singular | `{ mode, primaryBranch: "dev" }` from merge | Effective list / primary `dev` |
| R2 | Merged array wins | non-empty `primaryBranches` on merged object | Array wins over singular (existing precedence) |
| R3 | Legacy warn | merged `projectBaseBranch` only + logger | Warn once; primary from legacy |

**Where:** `packages/apps/cli/src/utils/resolvePrimaryBranches/unit.test.ts` — adjust input type if helper now takes `Pick<ResolvedProjectLocalConfig, …>` instead of `LocalConfig`.

### 5.8 `project-setup` scaffold (**S** — update)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| S1 | Default scaffold | `--projectName my-app` (mode default shared) | `project.json` = `{ projectName, primaryBranch: "main" }`; `local.json` = `{ mode: "shared" }` only |
| S2 | `--mode dedicated` + `--primaryBranch develop` | flags set | `project.json.primaryBranch === "develop"`; `local.json` = `{ mode: "dedicated" }` only |
| S3 | Gitignore still lists local.json | — | Unchanged |
| S4 | Already exists | second run | Failure unchanged |
| S5 | Does not rewrite existing | pre-create old-shaped files then… | Out of scope for setup command (setup already fails if `.lumpcode` exists) — no migration test required |

**Where:** `packages/apps/cli/src/commands/project-setup/unit.test.ts` (rewrite expectations in existing cases).

### 5.9 Branch cap from project/local (**C** — update)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| C1 | Cap on project, lump omits | open branches ≥ 2; project cap `2` | `runLumpFromJsConfig` / phase-2 path returns skipped too-many variant with cap `2` |
| C2 | Cap on local wins | project cap `5`, local cap `2`, lump omits | Effective cap `2` |
| C3 | Lump cap wins | lump cap `10`, project `2`, open branches `2` | Runs (not skipped) when under lump cap |
| C4 | Plan path | same as C1 via `planLumpFromJsConfig` | Plan reports would-skip / same cap messaging as today’s plan behavior when cap set on lump |

**Where:** `packages/apps/cli/src/utils/runLumpFromJsConfig/unit.test.ts`; wire through `runLumpFromLumpName` if defaults apply only in phase 1 — then assert in `packages/apps/cli/src/utils/runLumpFromLumpName/unit.test.ts` that loaded config includes inherited cap before evaluate. Prefer one host that proves **apply timing**: after load, before skip evaluation.

### 5.10 Call-path wiring (**W** — update)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| W1 | `runLumpFromLumpName` applies defaults | lump omits `command`; project `command: "cursor"`; spy `runLumpFromJsConfig` / `jsConfigToRunLumpInput` | Effective jsConfig has `command: "cursor"` |
| W2 | `planLumpFromJsConfig` | same | Plan uses inherited command / does not fail “missing command” if that were validated — at minimum inherited fields visible on planned config or successful plan with mock command module registered for tag |
| W3 | `lump-status` load path | lump omits `verbose`; local `verbose: true` | Status path that exposes effective config reflects verbose **or** logger verbose merge behaves as today when config verbose true — assert the same code path calls `applyLumpConfigDefaults` (spy ok) |
| W4 | `start` freezes merged config | start foreground with spy on `readProjectLocalConfig` | Called once at startup; tick uses frozen object (mutate disk after freeze → behavior unchanged), same freeze semantics as today’s `readLocalConfig` |
| W5 | Missing merged primary fails start/run | mode-only local + name-only project | Failure before tick / before run |

**Where:**

- W1 → `packages/apps/cli/src/utils/runLumpFromLumpName/unit.test.ts`
- W2 → `packages/apps/cli/src/utils/planLumpFromJsConfig/unit.test.ts`
- W3 → `packages/apps/cli/src/commands/lump-status/unit.test.ts` (or util the command uses)
- W4–W5 → `packages/apps/cli/src/commands/start/testing/general.unit.test.ts` (or focused new file under `start/testing/`)

Use spies to prove **single owner** calls (`readProjectLocalConfig`, `applyLumpConfigDefaults`) rather than re-implementing merge in assertions.

### 5.11 Fixture / helper updates (**F**)

| ID | Case | Expectation |
| --- | --- | --- |
| F1 | `writeLocalJson` typing | Accepts new optional fields; still requires `mode` |
| F2 | Start / multi-branch fixtures | Suites that use mode-only local still have a primary source (project or local) so `readProjectLocalConfig` succeeds |
| F3 | E2E `createE2eProject` | Can set project-level primary / command without breaking existing tests |

**Where:** `packages/apps/cli/src/testing/multiBranchFixtures.ts`, `packages/apps/cli/src/commands/start/testing/testHelpers.ts`, `packages/apps/cli/src/e2e/harness/createE2eProject.ts`. These are supporting changes — mark related broken hosts skipped in `testImpl` until helpers land with the stubs, or update helpers in `testImpl` behind the same skip discipline when needed for new cases to compile.

### 5.12 E2E (**E**)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| E1 | Fresh `project-setup` | CLI `project-setup --projectName e2e-clean --mode shared --primaryBranch main` in empty git repo | Read back files: project has `projectName` + `primaryBranch: "main"`; local is exactly `{ "mode": "shared" }` (parse JSON; no extra keys) |
| E2 | Inherited project `command` | After setup (or harness write): `project.json` includes `"command": "<tag>"` registered via e2e mock agent tag **or** lump uses omit top-level `command` while project sets tag that resolves to mock module; `lumpcode run --lumpName …` | Exit 0; mock agent ran (same success signals as existing e2e run scenarios) |
| E3 | Optional: local primary overrides project | project `primaryBranch: "dev"`, local `primaryBranch: "main"` (and mode); status/run preflight targets `main` | Assert via `lump-status` / log / branch checkout as existing multi-branch e2e patterns allow — skip if too heavy; unit **M1** already covers merge |

**Where:** prefer `packages/apps/cli/src/e2e/project-local-config.test.ts` (new) **or** extend `packages/apps/cli/src/e2e/ts-config-scenarios.test.ts` next to existing project-setup case. Use `writeE2eLumpFixture` / mock agent harness; no live Cursor/Copilot.

---

## 6. Implementation details for `testImpl`

### 6.1 Stubs (throw until implementation)

```ts
// readProjectJson/main.ts (testImpl stub)
export async function readProjectJson(_input: {
  localConfigFolderPath: string;
}): Promise<never> {
  throw new Error('not implemented');
}

// readProjectLocalConfig/main.ts
export async function readProjectLocalConfig(_input: {
  localConfigFolderPath: string;
}): Promise<never> {
  throw new Error('not implemented');
}

// applyLumpConfigDefaults/main.ts
export function applyLumpConfigDefaults(_input: {
  jsConfig: LumpJsConfig;
  resolved: ResolvedProjectLocalConfig;
}): never {
  throw new Error('not implemented');
}
```

Export from each `index.ts` and barrel `packages/apps/cli/src/utils/index.ts`.

### 6.2 Types stubs

Export `ResolvedProjectLocalConfig`, `ProjectJsonConfig`, `LocalJsonConfig` as temporary loose interfaces matching the Pick field lists in requirements (or `export type ResolvedProjectLocalConfig = any` only if needed for compile — prefer structural stubs so **T1** fails until Zod infer is wired).

### 6.3 Skip discipline

```ts
describe.skip('readProjectLocalConfig (clean-local-project-json-config)', () => {
  // M1–M12
});
```

For updated hosts, wrap only the new/changed `it` blocks (or a nested `describe.skip`) — do not skip unrelated existing coverage that still matches current production behavior **unless** the expectation itself must change for the new contract (e.g. L8 primary-optional). Those changed expectations must be skipped too so CI stays green.

### 6.4 Assertion style

- Prefer `result.success` / `Failure` string matching (`toContain` / `toMatch`) consistent with `readLocalConfig/unit.test.ts`.
- For merge, assert full resolved object with `toEqual` / `toMatchObject` including defaulted `workspaceStrategy`.
- For overlay, assert returned `LumpJsConfig` fields and that the input object was not mutated (`expect(jsConfig.command).toBeUndefined()` after call when it started undefined).

### 6.5 Temp dirs

Use `fs.mkdtemp` under `os.tmpdir()`; write both JSON files beside each other in a fake `.lumpcode` folder (`localConfigFolderPath`). Do not write into the repo workspace cwd.

---

## 7. Out of scope for automated tests (implementation checklist)

Verify manually or by review during **implementation** (not `testImpl`):

1. DOCS table in requirements (`local-config.md`, `project-config.md`, `get-started.md`, `lump-config.md`, `commands.md`, `concepts.md`, README if needed).
2. `localConfig.schema.json` — drop required-primary `anyOf`; add lump-default fields; keep `additionalProperties: false`.
3. New `projectConfig.schema.json` — `projectName` required; shared + lump-default allowlist; `additionalProperties: false`.
4. No new CLI flags for one-shot overrides.
5. No rewrite/migration of existing `local.json` / `project.json` on upgrade.
6. Merge exists only in `readProjectLocalConfig`; overlay only in `applyLumpConfigDefaults` (grep call sites).

---

## 8. Traceability to acceptance criteria

| AC (requirements) | Cases |
| --- | --- |
| 1 Membership + unknown hard-fail | P7–P9, L3–L4, N2–N3 |
| 2 Shared local-wins + merged primary | M1–M4, M7, M12, R* |
| 3 Lump defaults precedence / false / 0 | D1–D9 |
| 4 Path vs tag `command` | P10–P11, L5–L6 |
| 5 run/start/plan/status same merge+defaults | W1–W5, E2 |
| 6 Cap enforced when lump omits | C1–C4 |
| 7 project-setup scaffold | S1–S2, E1 |
| 8 Zod infer + Pick types | T1–T3 |
| 9 Single owners | W* spies + review checklist §7.6 |
| 10 Docs/schemas | §7 checklist |
| 11 Coverage green + fixtures | F*, unskip on implementation |

---

## 9. Suggested `testImpl` order

1. Add type stubs + util stubs + barrels.
2. New unit files **P** / **M** / **D** (all skipped) + **T**.
3. Update **L** / **N** / **S** / **R** expectations (skipped where contract changes).
4. Add **C** / **W** cases (skipped); adjust **F** helpers as needed for compile.
5. Add skipped **E1–E2** skeletons (or defer e2e file creation to implementation if harness needs production scaffold — prefer skipped e2e stubs that assert file shapes via CLI once unskipped).
6. Leave production readers/merge/defaults unimplemented (red when unskipped).
