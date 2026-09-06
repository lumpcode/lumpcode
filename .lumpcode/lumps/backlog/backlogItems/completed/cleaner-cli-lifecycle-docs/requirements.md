# Requirements: Cleaner CLI lifecycle docs

| Field | Value |
| --- | --- |
| **Backlog** | `cleaner-cli-lifecycle-docs` · priority **15** · type **docs** · workflow **[req]** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary: `packages/apps/cli/DOCS/` (markdown only). Runtime packages (`@lumpcode/cli`, `@lumpcode/core`, recipes, cli-types, cli-utils) unchanged. |

## Problem statement and motivation

Authors and operators cannot trust a single place for *when* lump-config hooks run. The existing sketch in `packages/apps/cli/DOCS/advanced-config.md` and the overview in `packages/apps/cli/DOCS/concepts.md` disagree with each other and with current CLI behavior (shared vs dedicated, discovery vs base preflight, locks, daemon ticks, soft-skip `disabled` on manual `run`).

Concrete pain:

1. One outdated pseudocode block mixes modes and omits locks, discovery-branch preflight, `BaseBranchFn`, command-module composition, and failure/teardown paths.
2. Shared vs dedicated differ in where config is read, which tree is preflighted, and how daemons scan — but docs show a single blended pipeline.
3. Hook call order is scattered across concepts, advanced-config, types, and lump-config without a findable canonical schema.
4. Stale wording (e.g. `git pull`, “`run` ignores `disabled`”) makes surrounding pages harder to trust next to any new diagram.

## Goals

1. Publish **at least two** lifecycle schemas in CLI DOCS: one **shared** mode, one **dedicated** mode.
2. Each schema covers the full path an author/operator cares about: discover → preflight/locks → workspace setup → per-context steps → commit/push → teardown, plus how a **daemon tick** wraps that path.
3. Every **author-facing** lump-config hook/function appears at its call site(s) in those schemas (see inventory below). CLI-generated phases are labeled as auto / not configurable in lump config.
4. Make the schemas easy to find via short cross-links and a tightened overview; fix only the surrounding inaccuracies that would contradict the schemas.
5. Align documented order with current CLI behavior (implementation is source of truth; prefer consistency with `AGENTS.md` engine/CLI bullets when summarizing).

## Non-goals

- Full rewrite of every DOCS page, README, or npm package README.
- New CLI commands, flags, JSON envelopes, or runtime behavior changes.
- Documenting internal util names (`runLumpFromLumpName`, `withWorkspaceLockHooks`, …) as user-facing API.
- Separate full schemas for every `workspaceStrategy` × mode matrix (checkout vs worktree may be callouts inside the two mode schemas).
- Core package README changes; `lumpConfig.schema.json` field edits (schemas are narrative DOCS, not JSON Schema).
- Migration guides or historical “how it used to work” notes.

## User stories / use cases

1. **Lump author** — Opens DOCS to learn whether `setupFn` runs before or after workspace setup, and whether `getContextListFn` sees the copy or the source checkout in shared mode.
2. **Lump author (hooks)** — Confirms `BaseBranchFn`, `branchFn`, `promptFn` / `commandFn` / `postCommandExecFn`, dynamic `steps`, and command-module `setup`/`teardown` composition order from one schema.
3. **Operator (dedicated server)** — Sees discovery-branch preflight, base-branch preflight, path + git-common-dir locks, and destructive in-place reset called out on the dedicated schema.
4. **Operator (daemon)** — Sees that a tick discovers/filter lumps (dedicated: per primary-branch subtick) then runs the same per-lump engine path as `lumpcode run`.
5. **New contributor** — Finds the canonical schemas from get-started / lump-config / concepts without hunting through outdated duplicates.

## Proposed behavior and UX

Docs-only. No new command syntax. Operators still use existing:

```text
lumpcode run <lumpName> [--discoveryBranch <branch>] …
lumpcode start [--include …] [--exclude …] [--daemonId …] …
```

### Canonical home

| Surface | Role |
| --- | --- |
| `packages/apps/cli/DOCS/advanced-config.md` § **Hook lifecycle** | **Canonical owner** of the detailed shared + dedicated lifecycle schemas (replace the current single pseudocode block). |
| `packages/apps/cli/DOCS/concepts.md` § **One run, end to end** (and daemon tick note under run vs start) | Short operator overview kept accurate; links to advanced-config for hook timing. Must not re-own a second full hook inventory. |
| Other DOCS pages | Findability links + fix contradictory one-liners only. |

No second full copy of the schemas on other pages.

### Schema format (contract)

Each mode schema must be readable as a single vertical timeline (fenced `text` / pseudocode and/or mermaid `flowchart TD`). Requirements for both schemas:

| Requirement | Detail |
| --- | --- |
| Mode label | Explicit `shared` or `dedicated` |
| Entry points | Manual `lumpcode run <lumpName>` and daemon tick invoking the same per-lump path |
| Phases in order | Discover/load → locks (path, git-common-dir at mutation points) → preflight(s) → context source + status/todo → `branchFn` → workspace setup → per-context loop → push → workspace teardown → lock release / status record refresh |
| Hook call sites | Every inventory row below appears where it runs (or marked N/A for that mode with one-line reason) |
| Auto vs author | CLI-generated steps labeled e.g. `auto:` (preflight, workspace setup/teardown, default marker commit, locked remote refresh) |
| Failure/teardown | After successful workspace setup: per-context `teardownFn` always runs; workspace teardown always runs; on step-walk failure skip that context’s git + remaining contexts + push (match current engine semantics already noted in concepts) |
| Worktree callout | Inside each schema (or a shared footnote): checkout holds execution-path lock for the whole run; worktree releases execution-path lock after setup while branch-path + git-common-dir locks still serialize git |

### Author-facing hook inventory (must appear)

Mutually exclusive context sources: show exactly one active path per run, with the other two marked unused.

| Hook / function | Notes for schema placement |
| --- | --- |
| `disabled` (boolean \| `DisabledFn` \| module path) | Evaluated after config load; soft-skip (`skipped: true`, reason `disabled`) for **both** daemon and manual `run` |
| `getContextListFn` | Context source; receives concrete `discoveryBranch` (+ `codeBasePaths`, `lumpVariables`). May be invoked when resolving `BaseBranchFn` and again on the engine todo path; CLI caches the raw list so the author function runs once per run adaptation |
| `contextMatchFn` | Same timing as `getContextListFn` (scanner path) |
| `contextListJson` + optional `contextOptionsFn` | `contextOptionsFn` only with `contextListJson` |
| `baseBranch` as `BaseBranchFn` (or file-path module) | After raw context list is available; before workspace setup / status-driven todo filter. String `baseBranch` is config, not a call |
| `branchFn` | Once per batch, after todo list, before workspace setup |
| `setupFn` | Once per context, after workspace setup, before step walk |
| Command module `setup` | Composed after lump `setupFn`; seeds `contextRunState["<commandName>Setup"]` |
| Dynamic `steps` item (`StepFn` / steps function) | Inside the per-context step walk when an item is a function |
| `promptFn` | Per leaf step when set (else `promptTemplate` / empty prompt — note non-Fn path briefly) |
| Step/`command` → `CommandFn` / command module `command` | Per leaf after prompt resolution; `null` skip still reaches `postCommandExecFn` |
| `postCommandExecFn` | After command (or skip); may return nested follow-on steps |
| `teardownFn` | Per context after step walk attempt (success or failure); soft-fail |
| Command module `teardown` | Composed before lump `teardownFn` |

**Out of author inventory (show as auto only):** generated `setupWorkspace` / `teardownWorkspace`, default marker commit message (`LUMP: <lumpName> - <contextName>` — not a lump-config `gitCommitMessageFn`), locked `refreshRemoteTrackingRefs`, path/git locks, `maximumNumberOfConcurrentBranches` skip gate.

### Mode-specific content (must be visible)

**Shared schema**

- Execution workspace = `~/.lumpcode/project-copies/<projectName>/`; project workspace (source) untouched by preflight.
- Context discovery and config load read the **source** project workspace; lump `discoveryBranch(es)` / `--discoveryBranch` ignored for scheduling (warn if flag passed).
- Single base-branch preflight targets `resolvedBaseBranch` on the **copy** at workspace-setup time (fetch / switch / hard-reset — not `git pull`).
- Daemon tick: discover loadable lumps → include/exclude → run matching lumps (no primary-branch subtick expansion).

**Dedicated schema**

- Project workspace = execution workspace = operator checkout (destructive reset).
- Phase-style flow: resolve concrete discovery branch → locked discovery preflight to that branch → load config → `disabled` → discovery allowlist vs `primaryBranches` → later base-branch preflight at workspace setup to `resolvedBaseBranch`.
- Manual `run` / plan / status may need `--discoveryBranch` when discovery rules are pattern-only.
- Daemon tick: for each scan branch from `effectivePrimaryBranches` → locked discover → include/exclude → same per-lump path (pass effective discovery into the run).

### Surrounding DOCS tighten (findability + contradiction fixes)

| Doc | Change |
| --- | --- |
| `advanced-config.md` | Replace § Hook lifecycle body with the two schemas + keep/relocate `contextRunState` and composition notes so they do not duplicate the timeline |
| `concepts.md` | Fix § One run, end to end order (discovery/status vs preflight/setup, no `git pull`); link to advanced-config schemas; one daemon-tick sentence pointing at the same |
| `lump-config.md` | Link “when hooks run” → advanced-config schemas; correct `disabled` row to soft-skip manual `run` as well as daemon; function forms already documented elsewhere may stay |
| `get-started.md` / `types.md` / `commands.md` (`run` / `start`) | One-line “lifecycle schemas” links where hooks or run flow are introduced |
| `advanced-config.md` workspace section | Drop “pull” wording if still present; align with fetch/reset + strategy table |

Do not expand examples.md into a third schema home.

## Technical approach

| Step | Where | Contract / change |
| --- | --- | --- |
| 1 | Verify against CLI behavior | Walk `run` / `start` paths mentally against current code so schema order matches reality (shared source discovery, dedicated discovery then base preflight, lock hold/release, teardown-on-failure). No production code edits. |
| 2 | `DOCS/advanced-config.md` | Canonical shared + dedicated schemas; inventory complete; composition + `contextRunState` retained beside schemas |
| 3 | `DOCS/concepts.md` | Operator overview + mermaid/text aligned; links to canonical schemas; daemon tick wrapper without a second hook list |
| 4 | Findability + fixes | `lump-config.md`, `get-started.md`, `types.md`, `commands.md`, workspace blurb — links and contradiction-only edits (`disabled`, pull→fetch/reset, order) |
| 5 | Cross-link sanity | From schemas, link out to `types.md` signatures and `concepts.md` concurrency/branch-resolution for depth; avoid re-explaining locks or branch resolution in full |

**Ownership:** lifecycle timeline prose/diagrams live only under `advanced-config.md` § Hook lifecycle. `concepts.md` owns operator mental model (workspaces, status state machine, concurrency). Callers (other DOCS pages) link; they must not paste a third full timeline.

## Docs updates

| Document | What changes |
| --- | --- |
| `packages/apps/cli/DOCS/advanced-config.md` | Primary: multi-schema Hook lifecycle |
| `packages/apps/cli/DOCS/concepts.md` | Aligned short “one run” + daemon tick pointer |
| `packages/apps/cli/DOCS/lump-config.md` | Findability link; `disabled` accuracy |
| `packages/apps/cli/DOCS/get-started.md` | Findability link |
| `packages/apps/cli/DOCS/types.md` | Findability link near hook signatures |
| `packages/apps/cli/DOCS/commands.md` | Findability links on `run` / `start` |
| Root / package READMEs | Unchanged unless a single stale “pull” / lifecycle sentence would contradict (prefer leave READMEs alone) |

## Acceptance criteria

1. `advanced-config.md` contains distinct **shared** and **dedicated** lifecycle schemas (not one blended pipeline).
2. Both schemas show discover → preflight/locks → workspace setup → per-context steps → commit/push → teardown, and how a daemon tick wraps the per-lump path.
3. Every author-facing hook in the inventory appears at the correct call site(s), including `disabled`, context source trio + `contextOptionsFn`, `BaseBranchFn`, `branchFn`, `setupFn` / command `setup`, dynamic `steps`, `promptFn`, `CommandFn` / command module `command`, `postCommandExecFn`, `teardownFn` / command `teardown`.
4. CLI-generated workspace/git/lock/refresh steps are labeled auto / not lump-config knobs; no user-facing `setupWorkspaceFn` / `teardownWorkspaceFn` / `gitCommitMessageFn` fields are reintroduced.
5. Shared vs dedicated differences above (copy vs checkout, discovery preflight, allowlist, daemon subticks, where context discovery reads) are visible without reading source.
6. `concepts.md` overview matches the same order and links to the canonical schemas; it does not maintain a competing full hook list.
7. Surrounding pages link to the schemas; `disabled` and preflight wording no longer claim “`run` ignores disabled” or routine `git pull` for preflight.
8. No runtime package code changes; DOCS-only diff for this item.
9. No duplicated full lifecycle schema outside `advanced-config.md` § Hook lifecycle.

## Reference: phase checklist (for schema authors)

```text
shared run:
  load config (source) → disabled?
  adapt config (context source [cached], BaseBranchFn?)
  tooManyOpenBranches?
  runLump: refresh refs → todo list → branchFn
  setupWorkspace: path lock(s) → preflight copy@baseBranch → branch workspace
  for context: setup(+cmd) → steps(prompt/command/post…) → teardown(+cmd) → git add/commit
  push → teardownWorkspace → release locks → update contextStatusRecord

dedicated run:
  resolve discoveryBranch → lock + preflight checkout@discovery → load config → disabled? → allowlist
  adapt config (context source [cached], BaseBranchFn?)
  tooManyOpenBranches?
  runLump: refresh refs → todo list → branchFn
  setupWorkspace: adopt/acquire locks → preflight checkout@baseBranch → branch workspace
  … same per-context / push / teardown / unlock / status record …

daemon tick:
  shared: discover loadable → filters → each matching lump = shared run path
  dedicated: for each scanBranch in effectivePrimaryBranches → locked discover → filters → each match = dedicated run path
```
