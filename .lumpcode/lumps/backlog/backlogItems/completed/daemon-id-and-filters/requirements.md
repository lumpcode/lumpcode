# Requirements: Daemon id + include/exclude filters (unify global / per-lump)

| Field | Value |
| --- | --- |
| **Backlog** | `daemon-id-and-filters` · priority **3** · `manualReq` |
| **Type** | feature |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary: `packages/apps/cli` (commands, utils, schema, DOCS, e2e). `@lumpcode/core` **unchanged**. `cli-types` / `cli-utils` only if they re-export `ignoredByGlobalDaemon` (remove). |

## Problem statement and motivation

Daemon identity is binary today: one **global** scheduler per project (`~/.lumpcode/daemons/<project>.daemon.*`) or one **per-lump** scheduler (`<project>.<lumpName>.daemon.*`). Collision rules ban global + peers; checkout allows only one project daemon; overlapping schedules are hard. Opting a lump out of global rotation needs `ignoredByGlobalDaemon`, which duplicates what a filtered scheduler should express.

Pain points:

1. Two daemon “kinds” with different discovery, concurrency, and collision rules.
2. No way to run one scheduler over a **subset** of lumps (except one exact `--lumpName`).
3. `ignoredByGlobalDaemon` is a one-off config knob for a problem that belongs on the CLI filter.
4. Companion commands cannot address multiple filtered daemons; bare `daemon-status` only sees global.

## Goals

1. **One daemon model** — every `start` is a scheduler that discovers like today’s global daemon (dedicated: all `effectivePrimaryBranches` subticks), then applies optional lump-name filters.
2. **`--include` / `--exclude`** — comma-separated exact names and `*`-globs; `--lumpName` on `start` is a deprecated single-include alias.
3. **Unique `daemonId`** — owns PID/log/meta paths; auto or `--daemonId`; reserved id `global` for unfiltered default.
4. **Overlapping daemons allowed** — start gates on id uniqueness (+ corrupt meta), not filter overlap or checkout peer count; locks remain the runtime coordinator.
5. **Companion UX** — target by `--daemonId`; `daemon-status` with no id lists all project daemons; deprecate `--lumpName` on companions.
6. **Remove** `ignoredByGlobalDaemon` and `start --discoveryBranch` (no legacy warn for the config field).
7. **Per-daemon `--maxParallelRun`** — worktree override of `local.json`; every worktree daemon may parallelize its filtered queue.

## Non-goals

- Changing `lumpcode run` (`--lumpName`, `--discoveryBranch` stay as today).
- Redesigning backlog item `disabled-global-single-object` (its global/single premise is invalidated; revise or cancel that item separately).
- Stable/hash-based ids for multi/glob filters (random `d-xxxxxx` only).
- Regex include/exclude, `?`, `**`, or path-like patterns.
- Cross-machine daemon registry; stop-all / kill-all CLI (list via `daemon-status` only).
- Core engine / `@lumpcode/core` API changes.
- Migrating old bare `<project>.daemon.*` files beyond one-release read/stop as id `global`.

## User stories / use cases

1. **Operator (default)** — `lumpcode start` → daemon id `global`, all loadable lumps, paths `…/<project>.global.daemon.*`.
2. **Operator (subset)** — `lumpcode start --include=backlog,refacto-* --exclude=refacto-wip --daemonId=agents` runs only matching lumps; stop with `--daemonId=agents`.
3. **Operator (legacy solo)** — `lumpcode start --lumpName=backlog` warns deprecation, behaves as `--include=backlog`, auto id `backlog` (or `backlog-2` if taken).
4. **Operator (overlap)** — two daemons both include `backlog` with different ids/crons; both start; workspace locks serialize the lump.
5. **Operator (status)** — `lumpcode daemon-status` lists every alive project daemon (id, pid, filters, cron, in-flight).
6. **Operator (parallel)** — worktree + `--maxParallelRun=3` on a filtered daemon pools up to 3 matching lumps per tick.

## Proposed behavior and UX

### CLI — `start`

```bash
lumpcode start [--include=<patterns>] [--exclude=<patterns>] [--daemonId=<id>]
               [--maxParallelRun=<n>] [--lumpName=<name>] [--cronSetup=<expr>] [--foreground] [--json]
```

| Option | Contract |
| --- | --- |
| `--include` | Comma-separated patterns; repeatable flags concatenate. Omit/empty = all loadable names before exclude. |
| `--exclude` | Same pattern language; applied after include. |
| `--lumpName` | **Deprecated.** ≡ `--include=<name>`. Warn. Fail if combined with `--include`. |
| `--daemonId` | Explicit id; charset `[a-zA-Z0-9_-]+`. |
| `--maxParallelRun` | Positive int. Worktree: overrides `local.json` for this daemon. Checkout: **fail** if passed. |
| `--discoveryBranch` | **Removed** from `start` (keep on `run` / plan / status). |

Pattern language: only `*` (full-string match on lump name). No `?` / `**` / `/`.

### Daemon id resolution

```ts
resolveDaemonId(input: {
  explicitDaemonId?: string;
  include?: string[]; // after --lumpName merge
  exclude?: string[];
  existingDaemonIds: ReadonlySet<string>; // alive ids for this project
}): Success<string> | Failure<string>
```

| Case | Id |
| --- | --- |
| Unfiltered (no include/exclude/lumpName), no `--daemonId` | `global` |
| Unfiltered + `--daemonId=<other>` | `<other>` (multiple full-queue daemons allowed) |
| `--daemonId=global` + any filter | **Fail** (`global` reserved for unfiltered) |
| Single exact include, no `--daemonId` | that name; if taken → `name-2`, `name-3`, … |
| Auto-id would be `global` under a filter (lump named `global`) | **Fail** — require `--daemonId` |
| Multi include and/or any glob, no `--daemonId` | `d-` + 6 lowercase hex; retry on clash |
| Explicit id already alive | **Fail** `daemonIdInUse` |

Print resolved `daemonId` and a stop one-liner on every successful start.

### Paths

```
~/.lumpcode/daemons/<projectName>.<daemonId>.daemon.{pid,log,meta.json}
```

Always include the id segment (including `global`). One-release compat: if `…/<project>.global.daemon.pid` missing but legacy `…/<project>.daemon.pid` exists, companions treating id `global` may use legacy paths.

```ts
daemonFileBaseName({ projectName, daemonId }): `${projectName}.${daemonId}`
// Replace lumpName?: optional on path helpers with required daemonId (except legacy global alias reader).
```

### Start collision gate

```ts
assertDaemonStartAllowed(input: {
  projectName: string;
  daemonId: string;
  running: ReadonlyMap<string, RunningDaemonInfo>; // keyed by daemonId
}): Success<void> | Failure<{ code?: 'daemonIdInUse' | 'daemonMetaCorrupt'; message: string }>
```

Allow start iff id free and no alive peer has corrupt/missing meta. **Delete** global-vs-lump, same-lump, and checkout/worktree peer exclusion rules.

### Tick / subtick

Dedicated (unchanged outer shape, every daemon):

1. For each concrete branch in expanded `effectivePrimaryBranches` (**subtick**): locked discover → apply include/exclude → if empty, no-op → else run filtered queue with `effectiveConcurrency`.
2. Shared: one discovery pass from source, then filter, then run.

Empty filter match: **warn once at start**; later empty subticks idle; **never** auto-stop. Exact includes need not exist at start.

```ts
effectiveConcurrency =
  workspaceStrategy === 'worktree'
    ? (cliMaxParallelRun ?? localJsonMaxParallelRun ?? 1)
    : 1;
```

### Meta

Single upgraded type (no `version` field). Stop writing `lumpName`.

```ts
type DaemonMeta = {
  daemonId: string;
  cronSetup: string;
  workspaceStrategy: WorkspaceStrategy;
  maxParallelRun?: number; // effective; restart replays via start flags
  include?: string[];
  exclude?: string[];
  /** @deprecated read-only; if set and include omitted → include: [lumpName] */
  lumpName?: string;
  busy?: boolean; // existing read fallback
  inFlightLumpCount?: number;
};

type DaemonMetaWrite = {
  daemonId: string;
  cronSetup: string;
  workspaceStrategy: WorkspaceStrategy;
  maxParallelRun?: number;
  include?: string[];
  exclude?: string[];
};
```

`--lumpName` start writes `include: [name]`, not `lumpName`. Restart respawns with meta’s `daemonId` / `include` / `exclude` / `maxParallelRun` / `cronSetup`.

### Companions

| Command | No id flags | `--daemonId` | `--lumpName` (deprecated) |
| --- | --- | --- | --- |
| `stop` / `restart` / `daemon-log` | Target id `global` | That id | Treat as daemonId; warn |
| `daemon-status` | **List all** project daemons | Single detail | Single detail; warn |

`--daemonId` + `--lumpName` together → fail.

List/status payload (human + `--json`) includes at least: `daemonId`, pid, running, `cronSetup`, `include`, `exclude`, `workspaceStrategy`, `maxParallelRun`, `inFlightLumpCount`.

### Removals (product)

| Surface | Action |
| --- | --- |
| `LumpJsConfig.ignoredByGlobalDaemon` | Delete type + `lumpConfig.schema.json` property + all tick filtering + docs. Unknown leftover keys in JS configs stay ignored (no fail, no warn). |
| `start --discoveryBranch` | Remove option and spawn forwarding; every daemon uses global-style multi-primary discovery. |
| Docs “global vs per-lump daemon” | Rewrite around daemonId + filters. |

## Technical approach

### Sequencing

1. **Path + id helpers** — `daemonFileBaseName` / `daemonPidPath` / `daemonLogPath` / `daemonMetaPath` / `resolveDaemonPaths` take `daemonId`; legacy bare-global reader for companions.
2. **`listRunningProjectDaemons`** — return `Map`/`Record` keyed by `daemonId` (drop `{ global?, lumps }`).
3. **`assertDaemonStartAllowed`** — rewrite to id-only + corrupt meta (or replace with a smaller helper).
4. **`resolveDaemonId` + lump filter util** — new kit under `utils/` (filter match + select names).
5. **`readDaemonMeta` / write path** — schema + `DaemonMetaWrite` as above; read compat for old `lumpName` and missing `daemonId` (infer from path).
6. **`start`** — new flags; drop `discoveryBranch`; filter after discover; concurrency for all worktree daemons; print id; detached child forwards new flags.
7. **Companions** — `resolveDaemonCommandScope` → daemonId; `daemon-status` list-all; deprecation warnings.
8. **Delete obsolete product surface** — see tables below.
9. **Docs** — commands, concepts, lump-config, local-config, README, schema descriptions.

### Delete / obsolete code

| Area | Delete or replace |
| --- | --- |
| `types/LumpJsConfig.ts` | Remove `ignoredByGlobalDaemon?: boolean`. |
| `schemas/lumpConfig.schema.json` | Remove `ignoredByGlobalDaemon` property. |
| `commands/start/main.ts` | Remove ignored-lump filter + startup “ignoring lump(s)” log; remove `--discoveryBranch` option, spawn arg, global warn-and-ignore branch, solo-only discoveryBranch threading into `runLumpFromLumpName`. Remove concurrency condition `!lumpNameOpt && …`. |
| `utils/validateDaemonLaunch/main.ts` | Remove global-only `--discoveryBranch` ignore path tied to “unscoped” daemon; align with filter/daemonId model (no solo discoveryBranch override). |
| `utils/assertDaemonStartAllowed/main.ts` | Delete global/per-lump/checkout mutual-exclusion branches and stop-hint helpers that assume `--lumpName` scope; keep only id + corrupt checks (or new util). |
| `utils/listRunningProjectDaemons/main.ts` | Delete `RunningProjectDaemons.global` / `.lumps` shape and per-lump `[^.]+` regex split; scan `\<project\>.\<daemonId\>.daemon.pid` (+ legacy bare global). |
| `utils/daemonFileBaseName` (+ pid/log/meta path inputs) | Delete `lumpName?` “omit = global bare basename” contract; require `daemonId` (compat only at resolve layer). |
| `utils/resolveDaemonPaths` / `resolveDaemonCommandScope` | Replace `lumpName?` with `daemonId`; drop “unscoped = bare project file” as the primary path. |
| `ResolvedDaemonPaths.lumpName` | Replace with `daemonId`. |

### Delete / rewrite tests

| Test | Action |
| --- | --- |
| `commands/start/testing/parallelGlobalDaemon.unit.test.ts` — **I1–I4** (`ignoredByGlobalDaemon`) | **Delete** those cases. |
| `utils/validateDaemonLaunch/unit.test.ts` — `ignoredByGlobalDaemon still validated` | **Delete** describe block. |
| `utils/assertDaemonStartAllowed/unit.test.ts` | **Rewrite** for id uniqueness + corrupt meta only; delete global-blocks-lump, lump-blocks-global, checkout-one-daemon, worktree-peer matrix cases. |
| `utils/listRunningProjectDaemons/unit.test.ts` | **Rewrite** for daemonId map + legacy bare `global` alias. |
| `utils/daemonFileBaseName/unit.test.ts`, `daemonPidPath` / `LogPath` / `MetaPath` / `resolveDaemonPaths` unit tests | **Rewrite** expectations to `<project>.<daemonId>.…`; drop bare-global as default write path. |
| `utils/resolveDaemonCommandScope/unit.test.ts` | **Rewrite** for `--daemonId` / deprecated `--lumpName` / default `global`. |
| `commands/start/testing/multiDiscoveryBranches.unit.test.ts` — **S3** shared `start --lumpName` + `--discoveryBranch` warn | **Delete** (flag removed). Solo `--discoveryBranch` start cases that only exist for per-lump override: **delete or rewrite** to “filtered daemon still multi-primary discovers”. |
| `commands/start/testing/general.unit.test.ts` | Update collision / path / stop-hint strings for daemonId model. |
| `commands/stop` / `daemon-status` / `daemon-log` / `restart` unit tests | Default scope = id `global` paths; add list-all status; deprecation warning assertions. |
| `e2e/daemon-scenarios.test.ts`, `e2e/harness/daemonHelpers.ts`, `testing/aliveDaemonSpawn.ts` | Pass/assert `--daemonId` / new paths; drop assumptions that global has no middle path segment; remove ignoredByGlobalDaemon e2e if any. |
| `e2e/multi-base-branches.test.ts` — daemon cases using `start --lumpName` + discoveryBranch | Align with filter-only start (no discoveryBranch flag). |

### Related backlog (out of scope, must not block)

| Item | Note |
| --- | --- |
| `disabled-global-single-object` | Premise (global vs single daemon) is obsolete; rewrite or cancel before implementing that item. |

## Testing strategy

| Level | Coverage |
| --- | --- |
| **Unit** | `resolveDaemonId` matrix; lump filter include/exclude/`*`; path basename; `assertDaemonStartAllowed` id-only; meta read compat (`lumpName` → include, legacy bare path → `global`); filter+`global` id fail. |
| **Integration** (`commands/start/testing/…`) | Unfiltered → id `global` + new path; `--include` multi + auto `d-xxxxxx`; second exact-lump → `name-2`; overlapping two daemons both run; `--maxParallelRun` worktree vs checkout fail; empty match warns and stays up; deprecated `--lumpName` warns; no `--discoveryBranch` on start; detached child argv forwards include/exclude/daemonId/maxParallelRun. |
| **Integration** (companions) | `daemon-status` list-all; stop/restart/log by `--daemonId`; deprecated `--lumpName` → id; restart replays filters from meta. |
| **E2E** | Smoke start/stop with `--daemonId` and `--include`; status list; legacy `--lumpName` start still works with warning. |

Prefer updating existing daemon suites over wholly new files when the scenario already exists.

## Docs updates

| Document | Change |
| --- | --- |
| `DOCS/commands.md` | `start`/`stop`/`restart`/`daemon-status`/`daemon-log` flags; collision; paths; list-all status; deprecations; remove discoveryBranch on start; remove ignoredByGlobalDaemon / per-lump concurrency footnotes. |
| `DOCS/concepts.md` | Single daemon model; filters; daemonId; delete ignoredByGlobalDaemon bullets. |
| `DOCS/lump-config.md` | Remove `ignoredByGlobalDaemon` row. |
| `DOCS/local-config.md` | Tick text: filter after discover; `maxParallelRun` applies to every worktree daemon; optional start override. |
| `README.md` | Drop ignoredByGlobalDaemon / “one global” framing; point to filters + daemonId. |
| `lumpConfig.schema.json` | Remove field (editors stop suggesting it). |

Document **current** spelling only (no migration guide).

## Acceptance criteria

- [ ] `start` with no filter creates daemon id `global` at `<project>.global.daemon.*` (legacy bare path still readable as `global`).
- [ ] `--include` / `--exclude` filter the tick queue; subticks may be empty without stopping the daemon; start warns if initial match set is empty.
- [ ] Auto-id and `--daemonId` rules match the tables above; `global` cannot be used with a filter.
- [ ] Multiple overlapping daemons can run; only duplicate `daemonId` or corrupt meta blocks start.
- [ ] Worktree daemons use `maxParallelRun` from CLI override or `local.json`; checkout rejects `--maxParallelRun`.
- [ ] `daemon-status` without id lists all daemons; stop/restart/log default to `global` or accept `--daemonId`.
- [ ] `--lumpName` on start and companions warns deprecated; start maps to include; companions map to daemonId.
- [ ] `ignoredByGlobalDaemon` fully removed from types, schema, runtime, docs; related tests deleted.
- [ ] `start --discoveryBranch` removed; filtered daemons use multi-primary discovery like today’s global.
- [ ] Meta writes `daemonId` + `include`/`exclude`/`maxParallelRun`; never writes `lumpName`; restart restores them.
- [ ] Obsolete collision tests and ignored-daemon tests deleted or rewritten per the delete tables.

## Reference: agreed contracts summary

```ts
type DaemonLumpFilter = { include?: string[]; exclude?: string[] };

type StartDaemonOptions = {
  include?: string[];
  exclude?: string[];
  lumpName?: string; // deprecated
  daemonId?: string;
  maxParallelRun?: number;
  cronSetup?: string;
  foreground?: boolean;
};

type RunningProjectDaemons = Record<string, RunningDaemonInfo>; // daemonId → info
```
