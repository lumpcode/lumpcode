# Test plan: daemon-id-and-filters

| Field | Value |
| --- | --- |
| **Backlog** | `daemon-id-and-filters` |
| **Kind** | Feature — unify daemons under `daemonId` + `--include`/`--exclude`; drop global vs per-lump, `ignoredByGlobalDaemon`, and `start --discoveryBranch` |
| **Primary packages under test** | `@lumpcode/cli` only (`packages/apps/cli` — commands, utils, schema, e2e harness) |
| **Not under test** | `@lumpcode/core`; live agents; docs/schema prose content (implementation checklist); `lumpcode run` discovery/`--lumpName` behavior (unchanged); stop-all / kill-all CLI; regex/`?`/`**` filter dialects; hash-stable multi-filter ids |

Source of truth: [requirements.md](./requirements.md). This plan is the source of truth for the `testImpl` stage.

---

## 1. Goals of the test suite

Prove that after implementation:

1. Every `start` is a global-style scheduler (dedicated: all `effectivePrimaryBranches` subticks; shared: one source discovery pass), then optional lump-name filters.
2. `--include` / `--exclude` accept comma-separated exact names and `*`-globs (full-string); repeatable flags concatenate; omit/empty include = all loadable names before exclude.
3. `resolveDaemonId` matches the requirements matrix (`global`, exact-name / `name-2`, `d-xxxxxx`, reserved `global` + filter fail, clash → `daemonIdInUse`).
4. PID/log/meta paths are always `~/.lumpcode/daemons/<project>.<daemonId>.daemon.*`; companions treating id `global` may read legacy bare `<project>.daemon.*` when the new path is missing.
5. Start collision gates only on duplicate `daemonId` and corrupt/missing peer meta — overlapping filters and checkout peer count are allowed.
6. Empty filter match warns once at start; later empty subticks idle; daemon stays up; exact includes need not exist at start.
7. Worktree `effectiveConcurrency = cliMaxParallelRun ?? localJsonMaxParallelRun ?? 1`; checkout rejects `--maxParallelRun` if passed; every worktree daemon (filtered or not) may parallelize.
8. Meta writes `daemonId` + `include`/`exclude`/`maxParallelRun` (never `lumpName`); reads compat: old `lumpName` → include; missing `daemonId` inferred from path.
9. Companions target `--daemonId` (default `global` for stop/restart/log); `daemon-status` with no id lists all alive project daemons; `--lumpName` deprecated → daemonId with warn; both flags together fail.
10. `ignoredByGlobalDaemon` fully removed from types/schema/runtime/tests; leftover JS keys ignored (no warn/fail). `start --discoveryBranch` removed.
11. Deprecated `start --lumpName` ≡ `--include=<name>` with warn; fail if combined with `--include`; auto id = that name (or `name-2`…).

Docs / `lumpConfig.schema.json` / DOCS / README updates are **implementation-stage acceptance**, not automated in `testImpl`.

---

## 2. Testing approach

| Level | Required? | Mechanism |
| --- | --- | --- |
| **Unit (id + filter + paths)** | Yes — primary for pure contracts | New `resolveDaemonId` / filter util suites; rewrite path / list / assert / meta / scope suites |
| **Unit / integration (CLI commands)** | Yes — primary for start/companions | Existing `start/testing/` fixtures + spy `runLumpFromLumpName`; real temp git projects; companion unit tests |
| **E2E scenarios** | Yes — thin smoke | Update harness paths; add/adjust smoke for `--daemonId` / `--include` / list-all status / deprecated `--lumpName` start |

### Prefer spies + deferred gates over real agents

Match `packages/apps/cli/src/commands/start/testing/parallelGlobalDaemon.unit.test.ts` / `daemonInFlightMeta.unit.test.ts`: spy `runLumpFromLumpName` with deferred promises, assert which lump names run and concurrency. Do **not** run real presets/agents.

### Prefer update over new when a host exists

| Host (today) | Becomes |
| --- | --- |
| `daemonFileBaseName` / `daemonPidPath` / `daemonLogPath` / `daemonMetaPath` / `resolveDaemonPaths` unit tests | Rewrite for required `daemonId` + `<project>.<daemonId>.…` (**P***) |
| `listRunningProjectDaemons/unit.test.ts` | Rewrite for `Record<daemonId, info>` + legacy bare → `global` (**L***) |
| `assertDaemonStartAllowed/unit.test.ts` | Rewrite: id uniqueness + corrupt meta only; **delete** global/per-lump/checkout matrix (**A***) |
| `resolveDaemonCommandScope/unit.test.ts` | Rewrite for `--daemonId` / deprecated `--lumpName` / default `global` (**C***) |
| `readDaemonMeta/unit.test.ts` | Extend for `daemonId` / `include` / `exclude` / `maxParallelRun`; compat `lumpName` → include (**M***) |
| `validateDaemonLaunch/unit.test.ts` — `ignoredByGlobalDaemon still validated` describe | **Delete** entire describe block |
| `start/testing/parallelGlobalDaemon.unit.test.ts` — **I1–I4** | **Delete** those cases; keep/adapt G*/parallel cases for every worktree daemon (not “global only”) (**Q***, **F***) |
| `start/testing/multiDiscoveryBranches.unit.test.ts` — **S3** + solo `start --discoveryBranch` | **Delete** S3; rewrite solo-discoveryBranch start cases to “filtered daemon still multi-primary discovers” (**D***) |
| `start/testing/general.unit.test.ts` | Update collision / path / stop-hint / per-lump path asserts for daemonId model (**S***) |
| `stop` / `restart` / `daemon-status` / `daemon-log` unit tests | Default scope = id `global` new paths; list-all status; deprecation (**K***, **DS***, **DL***, **R***) |
| `e2e/harness/daemonHelpers.ts`, `testing/aliveDaemonSpawn.ts`, `e2e/daemon-scenarios.test.ts`, `e2e/multi-base-branches.test.ts` | Pass/assert `--daemonId` / new paths; drop bare-global write assumptions (**E***) |

### Red → green during `testImpl` (skip both new and updated)

1. Write/extend all cases against the **post-implementation** contract.
2. Mark **every** case for this item with `it.skip` / `describe.skip` during `testImpl` — both **new** tests **and** **updated** hosts — so the suite stays green while product code is unchanged.
3. Add index-barrel-exported stubs (throwing `not implemented`) for new utils (`resolveDaemonId`, lump-name filter helper) so imports compile and unit tests run red once unskipped.
4. **Delete** obsolete cases (I1–I4, ignored validate block, S3, mutual-exclusion assert cases) in `testImpl` (or leave deleted without skip — deleted code needs no skip).
5. During **implementation**, unskip as behavior lands (or unskip all when complete). Do not leave updated hosts permanently skipped.

### Determinism for `d-xxxxxx`

Stub/inject the random hex source in `resolveDaemonId` tests (pass `randomHex6` / similar optional dep, or mock `crypto.randomBytes`). Integration tests that assert auto multi-filter ids should either inject the same hook via start deps **or** assert only `/^d-[0-9a-f]{6}$/` + path existence, not a fixed hex.

---

## 3. File layout (implementation details)

| Path | Role |
| --- | --- |
| `packages/apps/cli/src/utils/resolveDaemonId/{main,index,unit.test}.ts` | **Add** — id resolution matrix (**ID***). Stub in `testImpl`; barrel from `utils/index.ts` |
| `packages/apps/cli/src/utils/filterLumpNames/{main,index,unit.test}.ts` | **Add** — `*` pattern match + include/exclude select (**FL***). Name may be `filterLumpNames` / `matchLumpNamePattern` split if clearer; one util dir is enough if both live together. Stub + barrel |
| `packages/apps/cli/src/utils/daemonFileBaseName/{main,unit.test}.ts` | **Update** — require `daemonId`; basename `${projectName}.${daemonId}` (**P1–P2**) |
| `packages/apps/cli/src/utils/daemonPidPath` / `daemonLogPath` / `daemonMetaPath` / `resolveDaemonPaths` | **Update** — `daemonId` in inputs; drop `lumpName?` omit=global bare write contract; legacy bare read only at resolve/list layer (**P***) |
| `packages/apps/cli/src/utils/listRunningProjectDaemons/{main,unit.test}.ts` | **Update** — map keyed by daemonId + legacy bare → `global` (**L***) |
| `packages/apps/cli/src/utils/assertDaemonStartAllowed/{main,unit.test}.ts` | **Rewrite** — id-only + corrupt meta (**A***); delete peer-exclusion cases |
| `packages/apps/cli/src/utils/resolveDaemonCommandScope/{main,unit.test}.ts` | **Update** — daemonId scope (**C***) |
| `packages/apps/cli/src/utils/readDaemonMeta/{main,unit.test}.ts` | **Update** — schema + compat (**M***) |
| `packages/apps/cli/src/utils/validateDaemonLaunch/unit.test.ts` | **Delete** ignoredByGlobalDaemon describe; align any discoveryBranch-on-start assumptions |
| `packages/apps/cli/src/commands/start/testing/testHelpers.ts` | **Update** — `runDetachedStart` / `stopDaemon` / `daemonMetaPath` take `daemonId` (and optional include/exclude/maxParallelRun); drop bare-global path helper default |
| `packages/apps/cli/src/commands/start/testing/general.unit.test.ts` | **Update** — paths, collision, deprecation, print id (**S***) |
| `packages/apps/cli/src/commands/start/testing/parallelGlobalDaemon.unit.test.ts` | **Delete I1–I4**; adapt S1 (per-lump ignores maxParallel) → filtered daemon **uses** maxParallel; keep G* under every-worktree-daemon model (**Q***, **F***) |
| `packages/apps/cli/src/commands/start/testing/multiDiscoveryBranches.unit.test.ts` | **Delete S3**; rewrite solo `--discoveryBranch` start; filtered still multi-primary (**D***) |
| `packages/apps/cli/src/commands/start/testing/daemonFilters.unit.test.ts` | **Add** (optional new topic file) — include/exclude tick filtering, empty warn, overlap two daemons, `--lumpName` deprecate, no discoveryBranch flag, detached argv (**F***, **S***, **O***). Prefer this over bloating `general` if general is already large |
| `packages/apps/cli/src/commands/stop/unit.test.ts` | **Update** — default `global` new path; `--daemonId`; deprecated `--lumpName` (**K***) |
| `packages/apps/cli/src/commands/restart/unit.test.ts` | **Update** — replay filters from meta; scope by daemonId (**R***) |
| `packages/apps/cli/src/commands/daemon-status/unit.test.ts` | **Update** — list-all; single detail; payload fields (**DS***) |
| `packages/apps/cli/src/commands/daemon-log/unit.test.ts` | **Update** — default `global` path; `--daemonId` (**DL***) |
| `packages/apps/cli/src/testing/aliveDaemonSpawn.ts` | **Update** if it assumes bare global basename |
| `packages/apps/cli/src/e2e/harness/daemonHelpers.ts` | **Update** — `daemonPathsForProject({ daemonId })`; `stopDaemonSafely` accepts `daemonId` (**E0**) |
| `packages/apps/cli/src/e2e/daemon-scenarios.test.ts` | **Update/add** smoke (**E1–E3**) |
| `packages/apps/cli/src/e2e/multi-base-branches.test.ts` | **Update** daemon cases that used `start --lumpName` + `--discoveryBranch` |

If include/exclude parsing (comma-split + repeatable concat) is tiny and only used by `start` option normalization, keep it private in the command module and cover via **F***/**S*** — do not add a util directory for parse alone.

Run:

```bash
npm run test -w=@lumpcode/cli
```

E2E (after implementation / when touching harness):

```bash
npm run test:e2e:ci:node -w=@lumpcode/cli -- src/e2e/daemon-scenarios.test.ts
```

---

## 4. Shared test data / fixtures

### 4.1 Local config fragments

```json
{
  "mode": "dedicated",
  "primaryBranch": "main",
  "workspaceStrategy": "worktree",
  "maxParallelRun": 3
}
```

| Variant | Purpose |
| --- | --- |
| worktree + omit `maxParallelRun` | Default concurrency `1` |
| worktree + `maxParallelRun: 3` | local.json baseline for CLI override tests |
| `workspaceStrategy: "checkout"` | Reject `--maxParallelRun`; sequential ticks |
| Shared mode + worktree | Shared discovery then filter (**F7**) |

### 4.2 Minimal lump configs

Reuse `writeMinimalLump` / `writeCommittedLumps` from `packages/apps/cli/src/commands/start/testing/testHelpers.ts`.

Names for filter matrix (commit/push so dedicated discovery sees them):

| Lump name | Role |
| --- | --- |
| `alpha` | Exact include |
| `backlog` | Exact include / auto id |
| `refacto-a` / `refacto-b` / `refacto-wip` | Glob `refacto-*` + exclude |
| `global` | Reserved auto-id clash (lump named `global`) |
| `sideA` | Formerly ignored — now only excluded via CLI filter |

Do **not** write `ignoredByGlobalDaemon` in new fixtures. Leftover-key smoke (optional): one config that still contains the key must load without warn/fail (**X1**).

### 4.3 Alive / corrupt daemon peers

Reuse `aliveDaemonSpawn` + write pid/meta under daemons dir.

```ts
// New canonical path
`${projectName}.${daemonId}.daemon.{pid,log,meta.json}`

// Legacy bare global (compat read only)
`${projectName}.daemon.{pid,meta.json}`
```

Meta write shape for new starts:

```json
{
  "daemonId": "agents",
  "cronSetup": "*/5 * * * *",
  "workspaceStrategy": "worktree",
  "maxParallelRun": 3,
  "include": ["backlog", "refacto-*"],
  "exclude": ["refacto-wip"]
}
```

Legacy meta for compat reads:

```json
{ "cronSetup": "*/5 * * * *", "lumpName": "alpha", "workspaceStrategy": "checkout" }
```

Corrupt peers: alive pid + missing/invalid meta → `daemonMetaCorrupt` blocks any new start (**A3**).

### 4.4 Deferred `runLumpFromLumpName` spy

Same gate pattern as parallel-global-daemon-worktree:

```ts
type Gate = { resolve: () => void; promise: Promise<void> };
// mockImplementation: push input.lumpName; await gate; return success({ skipped: false, … })
```

Assert filter by comparing `started` to expected name set; assert concurrency via open gates / meta `inFlightLumpCount`.

### 4.5 Foreground start harness

Reuse `makeStartHandler` + `setupStartTestRepo`. Extend handler options typing in tests to pass `include`, `exclude`, `daemonId`, `maxParallelRun`, `lumpName`, `foreground`, `cronSetup`. Capture logger for deprecation / empty-match warns.

### 4.6 `existingDaemonIds` for `resolveDaemonId`

```ts
new Set<string>(['global', 'backlog', 'agents'])
```

---

## 5. Test cases

Each case: **ID**, **setup/data**, **expectation**, **where**.

### 5.1 `resolveDaemonId` (**ID** — new)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| ID1 | Unfiltered default | no include/exclude; no explicit id; existing `{}` | `success` → `'global'` |
| ID2 | Unfiltered + explicit other | no filters; `explicitDaemonId: 'agents'`; existing empty | `'agents'` |
| ID3 | `global` + any include | `include: ['alpha']`, `explicitDaemonId: 'global'` | `failure`; message mentions reserved / unfiltered |
| ID4 | `global` + any exclude | `exclude: ['alpha']`, `explicitDaemonId: 'global'` | Failure (same reserved rule) |
| ID5 | Single exact include auto | `include: ['backlog']`; existing empty | `'backlog'` |
| ID6 | Exact include taken → `-2` | `include: ['backlog']`; existing `{'backlog'}` | `'backlog-2'` |
| ID7 | Exact include `-2` taken → `-3` | existing `{'backlog','backlog-2'}` | `'backlog-3'` |
| ID8 | Auto would be `global` under filter | `include: ['global']` (lump name); no explicit | Failure — require `--daemonId` |
| ID9 | Multi include auto | `include: ['a','b']`; inject hex `abcdef` | `'d-abcdef'` |
| ID10 | Glob include auto | `include: ['refacto-*']`; inject hex | `/^d-[0-9a-f]{6}$/` |
| ID11 | Multi + clash retry | inject sequence `aaaaaa` (taken), then `bbbbbb` | `'d-bbbbbb'` |
| ID12 | Explicit id in use | `explicitDaemonId: 'agents'`; existing `{'agents'}` | Failure code/message `daemonIdInUse` |
| ID13 | Invalid charset | `explicitDaemonId: 'bad id'` / `foo/bar` | Failure (charset `[a-zA-Z0-9_-]+`) — if validated in resolve; else cover at start Zod (**S8**) |
| ID14 | Exclude-only counts as filtered | `exclude: ['alpha']`; no include; no explicit | Not `'global'`; auto `d-xxxxxx` (unfiltered means no include **and** no exclude) |

**Where:** `packages/apps/cli/src/utils/resolveDaemonId/unit.test.ts` (`describe.skip` until implementation).

### 5.2 Lump name filter (**FL** — new)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| FL1 | Omit include | names `[a,b,c]`; no include; no exclude | `[a,b,c]` (order preserved) |
| FL2 | Exact include | include `['b']` | `[b]` |
| FL3 | Multi exact | include `['c','a']` | Intersection preserving **source order**: `[a,c]` |
| FL4 | Glob `*` | include `['refacto-*']`; names `refacto-a`, `refacto-wip`, `other` | `refacto-a`, `refacto-wip` |
| FL5 | Exclude after include | include `['refacto-*']`, exclude `['refacto-wip']` | `refacto-a` only |
| FL6 | Exclude only | exclude `['b']`; names `a,b,c` | `a,c` |
| FL7 | No match | include `['missing']` | `[]` |
| FL8 | `*` is full-string only | pattern `facto-*` vs name `refacto-a` | No match |
| FL9 | Literal name with no glob | include `['a*b']` only matches name `a*b` if such exists — `*` is glob metachar: pattern `a*b` matches `axb` / `ab` per full-string glob rules used by implementation; document chosen semantics in test (requirements: only `*` metachar). Prefer: `*` → zero-or-more chars; no `?`/`**` |
| FL10 | Reject / ignore `?` as literal | pattern `a?b` vs `axb` | No glob `?` — either literal `?` match only or documented; **must not** treat `?` as single-char wildcard |
| FL11 | No path-like | pattern `foo/bar` vs name `foo/bar` | Exact/full-string only if `*` absent; names never contain `/` in practice — assert no special path behavior |

**Where:** `packages/apps/cli/src/utils/filterLumpNames/unit.test.ts` (or chosen util path). Pattern helper may be private to the same module.

### 5.3 Path basename + resolve (**P** — update)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| P1 | Basename always includes id | `projectName: 'demo'`, `daemonId: 'global'` | `demo.global` |
| P2 | Filtered id segment | `daemonId: 'agents'` | `demo.agents` |
| P3 | Pid/log/meta paths | same | `…/demo.global.daemon.pid` (etc.); **never** bare `demo.daemon.pid` as write target |
| P4 | `resolveDaemonPaths` write | `daemonId: 'global'` | Resolved paths use `demo.global.…` |
| P5 | Legacy bare read for `global` | Only bare `demo.daemon.pid` exists; resolve/list for id `global` | Companions / list treat as `global` (read path falls back); new writes still target `demo.global.…` |
| P6 | No lumpName omit contract | Calling old `lumpName?` API | Type/API removed — tests compile against `daemonId: string` |

**Where:** `packages/apps/cli/src/utils/daemonFileBaseName/unit.test.ts`, `daemonPidPath/unit.test.ts`, `daemonLogPath/unit.test.ts`, `daemonMetaPath/unit.test.ts`, `resolveDaemonPaths/unit.test.ts`.

### 5.4 `listRunningProjectDaemons` (**L** — rewrite)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| L1 | Empty dir | no pid files | `success` → `{}` / empty record |
| L2 | New global path | alive `proj.global.daemon.pid` + ok meta | map key `'global'` |
| L3 | Legacy bare as global | alive `proj.daemon.pid` only (no `.global.` file) | map key `'global'` |
| L4 | Prefer new over legacy | both bare and `.global.` alive | single `'global'` entry (prefer new path; do not double-count) |
| L5 | Filtered daemon id | `proj.agents.daemon.pid` | key `'agents'` |
| L6 | Multiple daemons | `global` + `agents` + `backlog-2` | three keys |
| L7 | Corrupt meta peer | alive pid + invalid meta | entry with `meta: 'invalid'` (or `'missing'`) |

**Where:** `packages/apps/cli/src/utils/listRunningProjectDaemons/unit.test.ts`.

### 5.5 `assertDaemonStartAllowed` (**A** — rewrite)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| A1 | Free id | `daemonId: 'agents'`; running empty | `success` |
| A2 | Id in use | running has `agents` ok | `failure`; code `daemonIdInUse` |
| A3 | Peer corrupt meta | different id free, but peer `meta: 'missing'/'invalid'` | `failure`; code `daemonMetaCorrupt` |
| A4 | Overlap allowed | running `agents` include backlog; starting `other` also intending backlog | **success** (assert does not see filters — only ids) |
| A5 | Checkout multi allowed | running one checkout daemon; start another distinct id checkout | **success** (delete old “only one checkout daemon” expectation) |
| A6 | Same as old “global blocks lump” | N/A | **Deleted** — no such case |

**Where:** `packages/apps/cli/src/utils/assertDaemonStartAllowed/unit.test.ts` — replace file contents; delete global-blocks-lump / lump-blocks-global / checkout-one / worktree-peer matrix.

### 5.6 Meta read/write contract (**M** — update `readDaemonMeta` + start writers)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| M1 | Parse new fields | meta with `daemonId`, `include`, `exclude`, `maxParallelRun` | All present on success data |
| M2 | Compat `lumpName` → include | `{ lumpName: 'alpha' }` without `include` | Reader (or scope adapter) yields effective include `['alpha']` for restart/status; raw may still expose deprecated `lumpName` as read-only |
| M3 | Infer `daemonId` from path | meta omits `daemonId`; file `proj.agents.daemon.meta.json` | Effective id `'agents'` at resolve/list/status layer |
| M4 | Writers omit `lumpName` | foreground start `--lumpName=backlog` (deprecated) | Written meta has `include: ['backlog']`, `daemonId` set, **no** `lumpName` key |
| M5 | Unfiltered write | bare `start` | `daemonId: 'global'`; include/exclude omitted or empty per writer contract; no `lumpName` |
| M6 | Allowed keys | extend start meta key allowlist | Allows `daemonId`, `include`, `exclude`, `maxParallelRun`; still forbids child-pid junk; does not require writing `busy` |

**Where:** M1–M3 → `packages/apps/cli/src/utils/readDaemonMeta/unit.test.ts` (+ path infer helper tests if separate); M4–M6 → `packages/apps/cli/src/commands/start/testing/general.unit.test.ts` or `daemonInFlightMeta.unit.test.ts` allowed-keys test.

### 5.7 `resolveDaemonCommandScope` (**C** — update)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| C1 | Default | no flags | `daemonId: 'global'`; paths = `proj.global.…` (with legacy fallback on resolve) |
| C2 | `--daemonId` | `daemonId: 'agents'` | paths for `agents` |
| C3 | Deprecated `--lumpName` | `lumpName: 'alpha'` | Treat as daemonId `alpha`; warn (warn may be at command layer — then C3 asserts scope id; warn in **K5**/**DS5**) |
| C4 | Both flags | `daemonId` + `lumpName` | Failure |

**Where:** `packages/apps/cli/src/utils/resolveDaemonCommandScope/unit.test.ts`; warn/both-flags may live in companion command tests if scope util stays pure.

### 5.8 Start — id, paths, deprecation, flags (**S** — update general + filters topic)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| S1 | Unfiltered → `global` | dedicated foreground `start` | success; prints/resolves `daemonId` `global`; pid/meta at `proj.global.daemon.*`; stop one-liner mentions `--daemonId=global` or equivalent |
| S2 | Explicit `--daemonId` | `--daemonId=agents` unfiltered | paths `proj.agents.…`; meta `daemonId: 'agents'` |
| S3 | Deprecated `--lumpName` | `--lumpName=backlog` | warn deprecation; behaves as include `backlog`; auto id `backlog` (or `backlog-2`); meta `include: ['backlog']` not `lumpName` |
| S4 | `--lumpName` + `--include` | both set | Failure |
| S5 | No `--discoveryBranch` option | pass `discoveryBranch` in handler options / Commander parse | Option absent — Zod/Commander rejects unknown **or** option removed so test asserts flag not forwarded; delete old warn-and-ignore paths |
| S6 | Detached child argv | detached start with include/exclude/daemonId/maxParallelRun | Spawned argv includes those flags (inspect `spawnFn` args) |
| S7 | Id in use at start | peer already on `agents` | Failure `daemonIdInUse` |
| S8 | Invalid `--daemonId` charset | `daemonId: 'bad id'` | Failure clear message |
| S9 | Print resolved id | any successful start | Handler messages/data include resolved `daemonId` |

**Where:** `packages/apps/cli/src/commands/start/testing/general.unit.test.ts` and/or `daemonFilters.unit.test.ts`.

### 5.9 Start — filter tick behavior (**F**)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| F1 | Exact include | lumps `alpha,beta`; `--include=alpha` | Spy invokes only `alpha` |
| F2 | Glob + exclude | lumps `refacto-a,refacto-b,refacto-wip,other`; `--include=refacto-* --exclude=refacto-wip` | Only `refacto-a`, `refacto-b` |
| F3 | Repeatable / comma include | `--include=alpha,beta` or two flags | Both scheduled |
| F4 | Empty match warns once | `--include=missing` | Start **succeeds**; logger warn once that no lumps match; spy never called; daemon stays up (pid/meta written) |
| F5 | Exact include need not exist | `--include=notYet`; no such lump dir | Same as F4 (warn, stay up) — not a launch failure |
| F6 | Exclude-only | `--exclude=beta` with `alpha,beta` | Only `alpha` |
| F7 | Shared mode filter | shared + worktree; `--include=alpha` | After source discovery, only `alpha` runs |
| F8 | Leftover `ignoredByGlobalDaemon` key | lump config still has the key `true` | Unfiltered daemon **still runs** that lump (no runtime filter); no warn about ignored field |

**Where:** `packages/apps/cli/src/commands/start/testing/daemonFilters.unit.test.ts` (new) or `parallelGlobalDaemon.unit.test.ts` after I* deletion.

### 5.10 Overlapping daemons (**O**)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| O1 | Two overlapping starts | daemon `a` include backlog; daemon `b` include backlog; distinct ids | Both starts succeed; both write own pid/meta |
| O2 | Both tick same lump | spy deferred; both foreground/cron forced tick if harness allows, or sequential handler ticks | Both eventually call `runLumpFromLumpName('backlog')` (locks serialize — do not assert parallel same lump; asserting both scheduled is enough) |

**Where:** start testing topic file; use worktree to allow concurrent daemons comfortably.

### 5.11 Concurrency / `--maxParallelRun` (**Q** — adapt parallel suite)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| Q1 | Worktree CLI override | local.json `maxParallelRun: 1`; start `--maxParallelRun=3`; ≥3 matching lumps | Peak concurrency === 3 |
| Q2 | Worktree filtered pool | `--include=refacto-*` matching 3; `--maxParallelRun=2` | Peak === 2 among filtered only |
| Q3 | Checkout rejects flag | checkout + `--maxParallelRun=2` | Start **fails** (clear message); no daemon started |
| Q4 | Checkout sequential without flag | checkout; local.json `maxParallelRun: 3` omitted or present | Peak === 1; if local.json has maxParallelRun>1, optional once-warn (existing behavior) — flag absence must not fail |
| Q5 | Unfiltered worktree still pools | no include; worktree; local `maxParallelRun: 2` | Peak === 2 (replaces “global only” framing of old G1) |
| Q6 | Delete old S1 | old “per-lump ignores maxParallelRun” | **Deleted/replaced by Q2** — filtered daemons **do** parallelize |

**Where:** `packages/apps/cli/src/commands/start/testing/parallelGlobalDaemon.unit.test.ts` (rewrite describe title; delete I1–I4 and old S1).

### 5.12 Multi-primary discovery without `start --discoveryBranch` (**D**)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| D1 | Filtered multi-primary | `primaryBranches: ['main','ver/…']`; lumps on each; `--include=<nameOnVer>` | Tick still scans all primaries (global-style); included lump on non-first primary still runs with correct `effectiveDiscoveryBranch` |
| D2 | Delete S3 | shared `start --lumpName` + `--discoveryBranch` warn | **Deleted** (flag removed) |
| D3 | No solo discoveryBranch override | cases that only existed to pass discoveryBranch into per-lump start | **Delete or rewrite** to D1-style filter + multi-primary |
| D4 | Allowlist still on run path | unchanged `run --discoveryBranch` / validate allowlist | Still covered by existing run/validate suites — do not regress; no start flag |

**Where:** `packages/apps/cli/src/commands/start/testing/multiDiscoveryBranches.unit.test.ts`.

### 5.13 Companions — stop / restart / log (**K**, **R**, **DL**)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| K1 | Default stop → `global` | alive at `proj.global.daemon.*` | stop without flags succeeds |
| K2 | Stop by `--daemonId` | alive `agents` | stops that id only; `global` remains if present |
| K3 | Deprecated `--lumpName` stop | alive id `alpha` via `--lumpName=alpha` | warn; stops `alpha` |
| K4 | Both id flags on stop | `--daemonId` + `--lumpName` | Failure |
| K5 | Legacy bare global stop | only bare `proj.daemon.pid` alive | stop default/`--daemonId=global` still works (compat) |
| R1 | Restart replays filters | meta has include/exclude/maxParallelRun/daemonId/cron | respawned start uses those values (assert spawn/handler options or post-restart meta) |
| R2 | Restart default scope | no flags | targets `global` |
| DL1 | daemon-log default `global` | log at new global path | reads/follows that file |
| DL2 | daemon-log `--daemonId` | id `agents` | opens `proj.agents.daemon.log` |

**Where:** `packages/apps/cli/src/commands/stop/unit.test.ts`, `restart/unit.test.ts`, `daemon-log/unit.test.ts`.

### 5.14 `daemon-status` (**DS**)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| DS1 | List all | two alive daemons (`global`, `agents`) | no-id status lists both; each entry has at least `daemonId`, pid, running, `cronSetup`, `include`, `exclude`, `workspaceStrategy`, `maxParallelRun`, `inFlightLumpCount` |
| DS2 | Single `--daemonId` | `--daemonId=agents` | single detail for that id |
| DS3 | JSON list shape | `--json` no id | machine-readable array/map of daemons with same fields |
| DS4 | Deprecated `--lumpName` | `--lumpName=alpha` | single detail; warn |
| DS5 | Missing id | `--daemonId=nope` with none running | failure / not-running message (match existing not-found tone) |
| DS6 | Legacy bare in list | only bare global pid | appears as `daemonId: 'global'` |

**Where:** `packages/apps/cli/src/commands/daemon-status/unit.test.ts`.

### 5.15 Removals / negative compile (**X**)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| X1 | Schema/type gone | `LumpJsConfig` / `lumpConfig.schema.json` | No `ignoredByGlobalDaemon` property; validateLumpJsonConfig does not require/mention it; unknown key in JSON may still fail schema additionalProperties — **JS** leftover keys ignored. Prefer: schema property removed; JS config with extra key still loads via JS path |
| X2 | Deleted tests absent | grep suite | No I1–I4 / “ignoredByGlobalDaemon still validated” / S3 discoveryBranch-on-start cases |
| X3 | `start --discoveryBranch` | Commander options for start | Option not registered (parse fails or ignored-as-unknown per CLI policy — prefer not registered) |

**Where:** X1 — `packages/apps/cli/src/utils/validateLumpJsonConfig/unit.test.ts` only if an existing ignored-field case exists; otherwise implementation checklist + type compile. X2 — deletion in `testImpl`. X3 — start option schema/unit.

### 5.16 E2E smoke (**E**)

| ID | Case | Data | Expectation |
| --- | --- | --- | --- |
| E0 | Harness paths | `daemonPathsForProject(project, { daemonId: 'global' })` | Uses `<project>.global.daemon.*`; `stopDaemonSafely` accepts `daemonId` |
| E1 | Start/stop with id + include | `start --include=<lump> --daemonId=e2eAgents` then stop `--daemonId=e2eAgents` | exit 0; pid path exists then cleaned |
| E2 | Status list | ≥1 running daemon | `daemon-status --json` lists id/filters |
| E3 | Deprecated `--lumpName` start | `start --lumpName=<lump>` | succeeds with deprecation warning in stderr/messages; stop via resolved id or `--lumpName` |

**Where:** `packages/apps/cli/src/e2e/harness/daemonHelpers.ts`; `packages/apps/cli/src/e2e/daemon-scenarios.test.ts`; align `multi-base-branches.test.ts` daemon cases (no `start --discoveryBranch`).

Prefer updating existing daemon e2e scenarios over wholly new files when a host already starts/stops a daemon.

---

## 6. Existing tests that must change

| Location | Action |
| --- | --- |
| `commands/start/testing/parallelGlobalDaemon.unit.test.ts` — I1–I4 | **Delete** |
| `commands/start/testing/parallelGlobalDaemon.unit.test.ts` — old S1 (per-lump ignores maxParallel) | **Replace** with filtered-daemon pool (**Q2**) |
| `utils/validateDaemonLaunch/unit.test.ts` — ignoredByGlobalDaemon describe | **Delete** |
| `utils/assertDaemonStartAllowed/unit.test.ts` | **Rewrite** (**A***); delete mutual-exclusion cases |
| `utils/listRunningProjectDaemons/unit.test.ts` | **Rewrite** (**L***) |
| `utils/daemonFileBaseName` (+ pid/log/meta/resolveDaemonPaths) unit tests | **Rewrite** (**P***) |
| `utils/resolveDaemonCommandScope/unit.test.ts` | **Rewrite** (**C***) |
| `utils/readDaemonMeta/unit.test.ts` | **Extend** (**M1–M3**) |
| `commands/start/testing/multiDiscoveryBranches.unit.test.ts` — S3 + solo discoveryBranch start | **Delete / rewrite** (**D***) |
| `commands/start/testing/general.unit.test.ts` | Update path/collision/meta/`lumpName` asserts (**S***, **M4–M6**) |
| `commands/start/testing/testHelpers.ts` | daemonId-based helpers |
| `commands/stop` / `restart` / `daemon-status` / `daemon-log` unit tests | Default `global` new paths; list-all; deprecations |
| `e2e/harness/daemonHelpers.ts`, `aliveDaemonSpawn.ts`, daemon e2e | New paths + `--daemonId` |
| `e2e/multi-base-branches.test.ts` | Remove start `--discoveryBranch` usage |

---

## 7. Out of scope (explicit)

| Item | Why |
| --- | --- |
| Changing `lumpcode run` `--lumpName` / `--discoveryBranch` | Non-goal |
| `@lumpcode/core` API | Unchanged |
| Stable/hash ids for multi/glob filters | Non-goal (`d-xxxxxx` only) |
| Regex / `?` / `**` filter language | Non-goal (assert absence via FL10) |
| stop-all / kill-all CLI | Non-goal (list via status only) |
| Cross-machine registry | Non-goal |
| Migrating bare files beyond one-release read/stop as `global` | Compat tests only (P5, L3, K5, DS6) |
| Rewriting backlog item `disabled-global-single-object` | Related; separate item |
| Docs / schema prose snapshots | Implementation checklist |
| Wall-clock e2e parallel speedup with real agents | Spies cover concurrency |

---

## 8. Acceptance mapping

| Requirements acceptance | Covered by |
| --- | --- |
| Unfiltered start → id `global` at `<project>.global.daemon.*`; legacy bare readable as `global` | S1, P1, P5, L3, K5, DS6 |
| `--include` / `--exclude` filter tick; empty subticks idle; start warns if initial match empty | FL*, F1–F7, F4–F5 |
| Auto-id and `--daemonId` rules; `global` cannot pair with filter | ID1–ID14, S2, S7–S9 |
| Overlapping daemons allowed; only duplicate id or corrupt meta blocks | A1–A5, O1–O2, S7 |
| Worktree maxParallel from CLI or local.json; checkout rejects CLI flag | Q1–Q5 |
| `daemon-status` lists all; stop/restart/log default `global` or `--daemonId` | DS1–DS6, K*, R*, DL* |
| `--lumpName` deprecated on start + companions | S3–S4, C3–C4, K3–K4, DS4, E3 |
| `ignoredByGlobalDaemon` removed; related tests deleted | X1–X2, F8, §6 deletes |
| `start --discoveryBranch` removed; filtered multi-primary discovery | S5, D1–D3, X3 |
| Meta writes daemonId + include/exclude/maxParallelRun; never lumpName; restart restores | M4–M6, R1 |
| Obsolete collision / ignored tests deleted or rewritten | §6, A6, X2 |

---

## 9. Commands to run

```bash
npm run test -w=@lumpcode/cli
```

Optional focus during red/green:

```bash
npm run test -w=@lumpcode/cli -- src/utils/resolveDaemonId/unit.test.ts
npm run test -w=@lumpcode/cli -- src/utils/filterLumpNames/unit.test.ts
npm run test -w=@lumpcode/cli -- src/utils/daemonFileBaseName/unit.test.ts
npm run test -w=@lumpcode/cli -- src/utils/listRunningProjectDaemons/unit.test.ts
npm run test -w=@lumpcode/cli -- src/utils/assertDaemonStartAllowed/unit.test.ts
npm run test -w=@lumpcode/cli -- src/utils/resolveDaemonCommandScope/unit.test.ts
npm run test -w=@lumpcode/cli -- src/utils/readDaemonMeta/unit.test.ts
npm run test -w=@lumpcode/cli -- src/commands/start/testing/
npm run test -w=@lumpcode/cli -- src/commands/stop/unit.test.ts
npm run test -w=@lumpcode/cli -- src/commands/restart/unit.test.ts
npm run test -w=@lumpcode/cli -- src/commands/daemon-status/unit.test.ts
npm run test -w=@lumpcode/cli -- src/commands/daemon-log/unit.test.ts
```

---

## 10. Implementation-stage checklist (not automated here)

Confirm manually / by review when implementing:

- [ ] `daemonFileBaseName` / path helpers require `daemonId`; legacy bare-global only at resolve/list/companion read
- [ ] `RunningProjectDaemons` is `Record<string, RunningDaemonInfo>` (or `Map`); drop `{ global?, lumps }`
- [ ] `assertDaemonStartAllowed` id-only + corrupt meta
- [ ] `resolveDaemonId` + `filterLumpNames` (or equivalent) barrel-exported from `utils/index.ts`
- [ ] `start`: `--include` / `--exclude` / `--daemonId` / `--maxParallelRun`; remove `--discoveryBranch`; deprecate `--lumpName`; print resolved id + stop one-liner; detached forwards new flags
- [ ] Tick: discover (global-style) → filter → empty no-op; `effectiveConcurrency` for every worktree daemon
- [ ] Meta write type without `lumpName`; restart replays `daemonId` / include / exclude / maxParallelRun / cronSetup
- [ ] Companions: `--daemonId`; default `global` for stop/restart/log; `daemon-status` list-all; both deprecated flags fail together
- [ ] Delete `LumpJsConfig.ignoredByGlobalDaemon` + schema property + tick filter + startup ignore log + docs rows
- [ ] Remove cli-types/cli-utils re-export of the field if present
- [ ] Rewrite DOCS (`commands.md`, `concepts.md`, `lump-config.md`, `local-config.md`) + README; current spelling only
- [ ] Update e2e harness + daemon scenarios for new paths
- [ ] All `it.skip` / `describe.skip` for this item unskipped and green
- [ ] Related backlog `disabled-global-single-object` noted obsolete (do not implement under this item)
