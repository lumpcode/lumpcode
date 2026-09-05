# Requirements: Git-driven daemon configs (dedicated supervise)

| Field | Value |
| --- | --- |
| **Backlog** | `git-driven-daemon-configs` · priority **3** · `manualReq` |
| **Type** | feature |
| **Status** | Pending implementation |
| **Depends on** | `daemon-id-and-filters` (landed). Complements `daemon-primary-branch-refresh-command` (tree ready after checkout); this item owns **daemon lifecycle from repo files**, not `refreshCommand`. |
| **Packages** | Primary: `packages/apps/cli` (supervise, start, meta, utils, schema, DOCS, e2e). `@lumpcode/core` **unchanged**. `cli-types` / `cli-utils` unchanged unless they re-export daemon meta types. |

### Vocabulary (LumpLine on `dev`)

A file-launched daemon is the same scheduler as `lumpcode start`. Dedicated ticks collect **`LumpLine[]`** via `collectDedicatedTickLumpLines` in `runForeground.ts` (not a lump-name-only queue, `RunLumpQueueItem`, or `collectTickLumps`). The pool is `runLumpLinesWithConcurrency`.

| Type | Contract |
| --- | --- |
| `LumpLine` | `{ lumpName; effectiveDiscoveryBranch? }` — optional branch = shared collect (no discovery bind). Owner: `utils/lumpLine/`. |
| `DedicatedLumpLine` | `LumpLine` with required `effectiveDiscoveryBranch`. Dedicated scoring/reorder use this. |

Repo file field **`discoveryBranch`** is the operator-facing name for the dedicated-line bind. It must equal the **`effectiveDiscoveryBranch`** of the `origin/<branch>` ref the file was read from (same string passed as `scanBranch` to `discoverDedicatedLumpsForScanBranch`). Do not invent a second branch type.

File `include` / `exclude` are lump-name filters (`filterLumpNames`). The running daemon then snapshots matched names into `DedicatedLumpLine`s per tick. Supervise file reconcile must not reimplement lump collect.

## Problem statement and motivation

Daemon fleet membership is machine-local: `lumpcode start` writes `~/.lumpcode/daemons/<project>.<id>.daemon.desired.json` and supervise only respawns those files. Teams on different dedicated primary lines cannot add or remove a scheduler by pushing git. There is no JSON/YAML daemon recipe in the repo, and no way to start supervise without also launching a daemon (`global` or a dummy `--exclude=*`, which still discovers every tick).

Pain points:

1. Dedicated machine control is not git-push: start/stop/filter/cron live only under `~/.lumpcode/`.
2. A team on `feat/team-a` must merge to the resolved primary before a daemon recipe exists, if discovery is “one branch only.”
3. Changing a file on disk should restart that scheduler; today nothing hashes or reconciles repo recipes.
4. Bootstrap requires a real daemon process even when the operator only wants supervise.

## Goals

1. **Repo recipes** — JSON/YAML files under `.lumpcode/daemons/` declare daemons (`cronSetup`, include/exclude, `disabled`, optional `maxParallelRun`, exact `discoveryBranch`). No TS/JS.
2. **All expanded primaries** — dedicated supervise reads recipes from every `expandPrimaryBranches` entry (each is a dedicated line’s `effectiveDiscoveryBranch`; remote-tracking refs), so a team can push a file on `feat/team-a` without merging to the resolved primary.
3. **Supervise reconcile** — existing `supervise` (not a second process) starts considered, non-disabled recipes; graceful-stops file-launched daemons that are `disabled` or no longer considered; hash-restarts when the normalized file changes.
4. **`--superviseOnly`** — start supervise without a daemon (not equivalent to `--exclude=*`).
5. **Safe respawn strategy** — desired.json respawn uses **that daemon’s meta** `workspaceStrategy`, not a live `local.json` read.

## Non-goals

- Shared-mode file-daemon reconcile (shared supervise stays desired.json keep-alive only).
- Re-reading `local.json` / `project.json` each tick or each supervise pass (daemon ticks stay freeze-at-start; file reconcile uses the merged config from **supervise start**). Freeze/unfreeze of `mode` / `workspaceStrategy` / `maxParallelRun` / `projectName` vs other fields is a **follow-up**.
- Running `refreshCommand` in supervise (lump-discovery hook after checkout only).
- Falling back to local branch refs or `HEAD` / working-tree files.
- Nested dirs, TS/JS recipes, in-file `daemonId`, glob `discoveryBranch`.
- Force-kill on hash-restart (`--force`).
- Documenting `lumpcode supervise` as an operator command (still started via `start`).
- Changing `@lumpcode/core`.
- Stopping CLI-started daemons because a repo file appeared, disappeared, or collided.

## User stories / use cases

1. **Operator (bootstrap)** — `lumpcode start --superviseOnly` on a dedicated clone. Supervise stays up. Push `.lumpcode/daemons/nightly.json` with `discoveryBranch: "dev"` → within a successful reconcile, daemon `nightly` is running.
2. **Team (feature line)** — `primaryBranches: ["dev", "feat/*"]`. Team pushes `feat/team-a:.lumpcode/daemons/agents.json` with `discoveryBranch: "feat/team-a"`. Supervise considers it when `feat/team-a` is an expanded `effectiveDiscoveryBranch`. No merge to `dev`.
3. **Operator (disable)** — set `disabled: true` on that file, push. Next successful reconcile graceful-stops the file-launched daemon. CLI `start` of the same id is untouched if it was never file-launched.
4. **Operator (edit)** — change `include` (not merely JSON key order or YAML vs JSON). Next successful reconcile graceful-restarts that id with the new recipe.
5. **Operator (collision)** — `lumpcode start --daemonId=nightly` already running. A repo `nightly.json` is considered: log error, do nothing. If the running process has `daemonConfigFile` in meta, that is “ours” (hash compare / already running), not a collision.

## Proposed behavior and UX

### Repo layout

```
.lumpcode/daemons/<daemonId>.json
.lumpcode/daemons/<daemonId>.yml
.lumpcode/daemons/<daemonId>.yaml
```

| Rule | Contract |
| --- | --- |
| Directory | Top-level only. Nested paths ignored (no error). |
| Stem | `daemonId`; charset `DAEMON_ID_CHARSET` (`/^[a-zA-Z0-9_-]+$/`). `global` allowed. |
| Other names | `README.md`, `.bak`, invalid stems: ignore, no error. |
| Two extensions, same stem, same `effectiveDiscoveryBranch` | Invalid for that id **on that branch**: log error, consider **neither** file there. |
| In-file `daemonId` | Forbidden (`.strict()` schema). Id is the stem only. |
| Identity | **Project-global** (same as `~/.lumpcode/daemons/<projectName>.<daemonId>.*`). Not per-machine, not per-branch. |

### File schema

Owner: `packages/apps/cli/src/utils/daemonConfigFile/` (schema, normalize, hash). Callers must not reimplement canonical JSON / hashing.

```ts
// daemonConfigFileSchema (.strict())
{
  discoveryBranch: string; // min 1; fail if isGitRefGlob (contains * or ?)
  cronSetup?: string; // default DEFAULT_DAEMON_CRON_SETUP
  include?: string[];
  exclude?: string[];
  disabled?: boolean; // default false
  maxParallelRun?: number; // positive int; optional
}
```

Omit/empty `include` / `exclude` ≡ unfiltered lump-name filters (same as `filterLumpNames`: omit/`[]` include = all loadable lumps). The spawned daemon tick then collects `DedicatedLumpLine`s for those names. Ship `packages/apps/cli/src/schemas/daemonConfig.schema.json` aligned with this schema (user-facing `$schema`, same bar as `lumpConfig.schema.json`).

`maxParallelRun` in the file ≡ `start --maxParallelRun`. If supervise freeze `workspaceStrategy === 'checkout'` and the field is set: log error, **do not start** that id. Omit → local.json default from the supervise-start snapshot.

### `discoveryBranch`

Exactly one exact branch name (the dedicated-line bind). Consider the file **iff** it was read from `refs/remotes/origin/<B>` and `discoveryBranch === B`, where `B` is that line’s `effectiveDiscoveryBranch`. File on `feat/a` with `discoveryBranch: "dev"` is dead.

Scan list = `expandPrimaryBranches` (unchanged order: resolved primary at index 0, rest configured-entry expand order). Same list `collectDedicatedTickLumpLines` uses; each entry is the `scanBranch` / `effectiveDiscoveryBranch` passed to `discoverDedicatedLumpsForScanBranch`. Do not rename that helper.

### Normalize + hash

Owner: `daemonConfigFile` (`normalizeDaemonConfigFile`, `hashDaemonConfigFile`).

Hash **normalized parsed config**, not file bytes (JSON vs YAML, key order, YAML comments, omit vs default `cronSetup` / `disabled`, omit vs `[]` include/exclude must not restart).

```ts
type NormalizedDaemonConfigFile = {
  discoveryBranch: string;
  cronSetup: string;
  disabled: boolean;
  include?: string[]; // omitted if empty; sorted
  exclude?: string[]; // omitted if empty; sorted
  maxParallelRun?: number;
};

hashDaemonConfigFile(parsed): string // SHA-256 hex of JSON.stringify(normalized, sorted keys)
```

### Meta

Extend `DaemonMeta` / `DaemonMetaWrite` / Zod in `readDaemonMeta`. `toMetaWrite` copies the object when launching from a file. CLI `start` **omits** it. `desired.json` **unchanged** (no hash).

```ts
type DaemonConfigFileMeta = {
  hash: string;
  discoveryBranch: string;
  path: string; // repo-root-relative POSIX, e.g. `.lumpcode/daemons/nightly.json`
};

type DaemonMetaWrite = { /* existing fields */ daemonConfigFile?: DaemonConfigFileMeta };
```

Presence of `daemonConfigFile` means this process is file-launched (“ours”).

### CLI — `start --superviseOnly`

```bash
lumpcode start --superviseOnly
```

| Rule | Contract |
| --- | --- |
| Exclusive with | `--include`, `--exclude`, `--daemonId`, `--cronSetup`, `--maxParallelRun`, `--lumpName`, `--foreground` (fail if any set). |
| Effect | `ensureProjectSupervisor` only. No `desired.json`, no daemon spawn, no `resolveDaemonId`. |
| Modes | Shared and dedicated. File reconcile still dedicated-only. |
| Idempotent | Supervisor already alive → success. |
| Docs | Document this flag. Do **not** document `supervise` as an operator command. |

Success envelope is not the daemon-ticks payload:

```ts
type SuperviseOnlyStartOutput = {
  messages: string[];
  data: { projectName: string; supervisorPid?: number };
};
```

`--exclude=*` is **not** this: it still starts a daemon that expands/discovers every tick.

### Git read (dedicated file reconcile only)

Owner: `discoverDaemonConfigFiles`. No `fs.readFile` of cwd, no `HEAD`, no local `feat/a` fallback.

After lock + fetch:

1. `git fetch --prune --no-write-fetch-head origin` (timeout `DISCOVERY_GIT_TIMEOUT_MS`).
2. For each `effectiveDiscoveryBranch` in expand order: `git ls-tree --name-only refs/remotes/origin/<effectiveDiscoveryBranch> .lumpcode/daemons` then `git show refs/remotes/origin/<effectiveDiscoveryBranch>:<posixPath>`.

Missing `origin/<effectiveDiscoveryBranch>`: skip that branch, warn once per pass, do **not** fail the whole snapshot.

Do **not** run `refreshCommand`. File must be committed on that branch.

### Supervise timing

Keep-alive (desired.json) stays every `SUPERVISE_LOCAL_PASS_INTERVAL_MS` (30s), no git.

New const: `SUPERVISE_DAEMON_CONFIG_RECONCILE_INTERVAL_MS = 5 * 60_000`.

```
nextDueAt = 0 at supervise start (first 30s tick tries file reconcile)
each 30s:
  desired.json keep-alive
  if now >= nextDueAt:
    try gitCommonDirLock lockMode: 'fail'
    busy or fetch/discover failure → leave nextDueAt (retry next 30s)
    snapshot taken → apply start/stop/hash-restart
      if apply needs another try (daemonBusy on graceful stop/restart) → leave nextDueAt
      else nextDueAt = now + 5min
```

Lock holder label (not a lump name): `__daemon-config__` (const next to `DISCOVERY_SCAN_LOCK_HOLDER`). Never `wait` on this lock. Hold the lock only for fetch + ls-tree/show; **release before** spawn/stop.

Launch collision (id taken, not ours) after a snapshot: **do not** stay due (no 30s error spam). `daemonBusy` on graceful stop/restart: **stay due**.

Shared mode or supervise-start snapshot `disabled === true`: skip file reconcile (keep-alive still runs).

Merged `local.json`/`project.json` for file reconcile: **one read at supervise start** (same freeze-at-start as today’s daemon). Pass that snapshot into `launchStartDaemon` for file-launched recipes. Do not re-read for strategy/primaries/`disabled` on each due pass.

### Considered set (per successful snapshot)

Owner: `discoverDaemonConfigFiles`.

For each `effectiveDiscoveryBranch`, each valid top-level file: parse + schema; consider iff `discoveryBranch === effectiveDiscoveryBranch`. Group by `daemonId` in expand order. Winner = first. Extra matching files: log error (id + branches), drop extras (do not fail the snapshot).

Invalid parse/schema: log, drop that file (if it was the only source for a running file-daemon, that id is no longer considered).

### Apply (after snapshot)

Owner: `reconcileDaemonConfigFiles`. Uses `launchStartDaemon` / `stopOneDaemon`. Must not duplicate spawn argv / desired write.

| Running? | Meta | Considered | Action |
| --- | --- | --- | --- |
| No | — | enabled winner | `launchStartDaemon` with recipe + `daemonConfigFile` meta |
| No | — | missing / `disabled` | no-op |
| Yes | `daemonConfigFile` set | enabled, same hash | no-op (ours, already running; **no** collision log) |
| Yes | `daemonConfigFile` set | enabled, hash changed | graceful restart (`stopOneDaemon`, not `--force`); then start new recipe; busy → stay due |
| Yes | `daemonConfigFile` set | `disabled` or not considered | graceful stop; busy → stay due |
| Yes | no `daemonConfigFile` | any file wants that id | log error, skip id (do not steal CLI/unknown process) |

**noLongerConsidered** (file-launched only): deleted; `effectiveDiscoveryBranch` gone from expand; `discoveryBranch` mismatch; invalid file dropped; lost same-id contest.

Checkout + file `maxParallelRun` set: treat as invalid start (log, do not start). A hash change into this combo is a normal hash-change stop; the start pass then refuses. The running process does not outlive an illegal considered file.

### Desired.json respawn (existing keep-alive)

Owner: `runSuperviseLocalPass` `spawnDesiredDaemon` only. Command modules must not re-read `local.json` for respawn strategy.

Today: `recipeFromDesired(desired, localConfig.workspaceStrategy)` after a **live** `readProjectLocalConfig`. **Change:** `workspaceStrategy` from **that daemon’s existing meta**. Missing/invalid meta → skip spawn (fail-closed). Do not start a checkout daemon because `local.json` flipped while a worktree sibling is still alive.

New `lumpcode start` still reads live `local.json` (operator can still mix strategies; out of scope to gate that).

## Technical approach

Implement as **standalone tickets** on a feature branch. This file stays the global contract; do not fork behavior in a ticket.

Index and slices: [`tickets/README.md`](./tickets/README.md).

**Owners (do not duplicate):**

| Concern | Owner |
| --- | --- |
| Canonical hash | `daemonConfigFile` |
| Git listing / consider / same-id winner | `discoverDaemonConfigFiles` |
| Start/stop/restart/collision | `reconcileDaemonConfigFiles` |
| Respawn `workspaceStrategy` | `spawnDesiredDaemon` |
| `--superviseOnly` | `start` handler |

## Testing strategy

| Level | Coverage |
| --- | --- |
| **Unit** `daemonConfigFile` | Default vs explicit `cronSetup`/`disabled` same hash; JSON vs YAML same hash; key order; empty include ≡ omit; sorted include; glob `discoveryBranch` fails schema; extra key fails. |
| **Unit** `discoverDaemonConfigFiles` | Consider only `discoveryBranch === effectiveDiscoveryBranch`; two extensions one stem → neither; first expand-order id wins; ignore README/nested; skip missing origin ref. |
| **Unit** `reconcileDaemonConfigFiles` | Start enabled; skip `disabled`; ours same hash no-op; hash change restart; CLI id collision log+skip; file-launched + gone → stop; lock busy → stay due; collision after snapshot does not stay due; `daemonBusy` stays due. |
| **Unit** `start --superviseOnly` | Exclusive flags fail; no desired/pid daemon files; `ensureProjectSupervisor` called; already-alive supervise success. |
| **Unit** `spawnDesiredDaemon` | Uses meta `workspaceStrategy`; does not use live local.json strategy; skip on bad meta. |
| **Integration** supervise | Dedicated fixture: file on `feat/*` head considered without that content on resolved primary; shared mode does not start from files. |
| **E2E** | `--superviseOnly` then a committed recipe appears after fetch; `daemon-status` shows `daemonConfigFile` path; stop `--all` still stops supervise. |

Prefer extending existing supervise / start / `readDaemonMeta` suites over wholly new harnesses when a fixture already exists.

## Docs updates

| Document | Change |
| --- | --- |
| `DOCS/commands.md` | `start --superviseOnly`; exclusive flags; envelope. File recipes: not a second supervise command. |
| `DOCS/concepts.md` | One section: repo daemon files, dedicated-only, `discoveryBranch` as the dedicated-line bind (`effectiveDiscoveryBranch`), hash-restart, collision, bootstrap. Link from start; do not duplicate git fetch flags on other pages. |
| `DOCS/get-started.md` | Optional dedicated “push a daemon file” after `--superviseOnly`. |
| `schemas/daemonConfig.schema.json` | New (editors). |
| CLI `start` description | Mention `--superviseOnly`. |

Document **current** spelling only.

## Acceptance criteria

- [ ] Dedicated supervise, after `--superviseOnly` or any `start`, considers top-level `.lumpcode/daemons/<id>.{json,yml,yaml}` on every expanded primary via `origin/<effectiveDiscoveryBranch>` (not cwd/`HEAD`).
- [ ] A file is considered only when `discoveryBranch` is exact and equals that line’s `effectiveDiscoveryBranch`.
- [ ] Same `daemonId` on two expanded primaries: first `expandPrimaryBranches` entry wins; later sources log and are ignored.
- [ ] Same stem, two extensions on one branch: neither considered; error logged.
- [ ] Normalized hash change → graceful restart; JSON/YAML/key-order/empty-include do not; `daemonBusy` retries next 30s until success, then 5 min.
- [ ] File-launched + `disabled` or no longer considered → graceful stop. CLI-started processes never stopped for these reasons.
- [ ] Running daemon without `daemonConfigFile` and a considered file with that id → log, skip (no steal).
- [ ] `gitCommonDirLock` `fail` on file reconcile; busy skips git work and stays due; 30s desired.json keep-alive still runs.
- [ ] `start --superviseOnly` starts/adopts supervise only; rejected with daemon-launch flags; `--exclude=*` still starts a real daemon.
- [ ] Shared supervise does not start/stop from repo files.
- [ ] `spawnDesiredDaemon` takes `workspaceStrategy` from meta, not live `local.json`.
- [ ] No `refreshCommand` in this path. No second copy of hash, consider, or stem/ext rules outside the named owners.
- [ ] Docs/schema describe the file format and `--superviseOnly`; `supervise` remains undocumented as an operator entry.

## Reference: apply + timing

```ts
const SUPERVISE_DAEMON_CONFIG_RECONCILE_INTERVAL_MS = 5 * 60_000;
const DAEMON_CONFIG_RECONCILE_LOCK_HOLDER = '__daemon-config__';

type ConsideredDaemonConfig = {
  daemonId: string;
  effectiveDiscoveryBranch: string; // expandPrimaryBranches entry; DedicatedLumpLine bind
  path: string;
  parsed: z.infer<typeof daemonConfigFileSchema>;
  hash: string;
};
```
