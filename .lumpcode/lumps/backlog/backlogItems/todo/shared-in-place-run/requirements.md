# Requirements: shared in-place run (laptop rehearsal)

| Field | Value |
| --- | --- |
| **Backlog** | `shared-in-place-run` · priority **0** · type **feature** |
| **Status** | Pending implementation · tickets under `tickets/` |
| **Depends on** | — |
| **Packages** | Primary `@lumpcode/cli`. `@lumpcode/recipes` (`openPrPostTeardown` skip). Website + CLI `DOCS/` + `articles/`. `@lumpcode/core` unchanged. |

Tickets (sibling `desc.yml` names; runtime context `shared-in-place-run-<ticket>`):

| Ticket | Slice |
| --- | --- |
| `in-place-workspace` | In-place walk: no copy, no preflight, git no-ops, detached gate, on-base warn |
| `shared-run-review` | TTY commit / exit after a successful walk |
| `shared-mode-no-daemon` | Refuse `start` / `restart` / `start --superviseOnly` |
| `open-pr-lump-prefix` | `openPrPostTeardown` skip unless `branchName` starts with `lump/` |
| `shared-in-place-docs` | Website, CLI `DOCS/`, articles, `AGENTS.md` |

## Problem statement and motivation

Shared mode exists so a laptop can develop a lump without a worker. Today it uses `~/.lumpcode/project-copies/<projectName>/`, resets that copy to `origin/<base>`, and cuts `lump/<lumpName>/…`. That fights the authoring loop: write the lump on `make-my-new-lump`, run it, see the result on **that** branch, edit the lump, run again.

1. A second PR (`lump/…`) does not include the authoring-branch delta.
2. The copy desyncs (`npm i` / builds and unpushed commits stay on the laptop).
3. Retry means delete a lump branch and run again.
4. Auto commit + push stamps markers before the author has validated the updates.
5. `start` in shared adds a cron on a tree the operator also edits.

## Goals

1. Shared `lumpcode run` executes on the project workspace (this checkout). No copy, no destructive git, no `lump/…` branch.
2. The walk does not commit or push. Status stays remote-marker based.
3. After a successful walk that executed contexts, an interactive TTY prompt offers commit (LUMP markers, no push) or exit (leave dirty; rerun is another `lumpcode run`).
4. Dirty work trees are allowed. Detached HEAD fails before any agent write.
5. Running on the execution base (`resolvedBaseBranch`) is allowed. Warn once.
6. `start`, `restart`, and `start --superviseOnly` fail in shared. `stop` / `daemon-status` still work.
7. Dedicated behavior is unchanged (preflight reset, `lump/…`, `refreshCommand` on tick, `start`).
8. User-facing docs, website, and listed articles describe rehearsal vs worker. Do not document in-place shared `run` before this ships.

## Non-goals

- `--retry` / automatic strip of `LUMP:` commits. After an accepted commit, redo is `git reset` (document it). Between runs, exit and `lumpcode run` again.
- `refreshCommand` on shared `run`.
- Hashing or recopying the tree. Creating or migrating `project-copies`.
- Auto-deleting leftover `project-copies/` dirs.
- Changing core status (`toDo` / `branchPushed` / `finished`) or marker strings. Local-only markers stay `toDo`.
- Refusing `run` when `HEAD` is the execution base.
- Refusing `run` when the work tree is dirty.
- `lump-plan` / `lump-status` dirty gates or copy preflight.
- New CLI flags (`--in-place`, `--retry`).
- In-process "rerun" menu item. Rerun is exit + another `lumpcode run`.
- Prompting from `runLumpFromLumpName`, `runLumpFromJsConfig`, or the daemon tick.
- Teaching shared `run` to skip contexts from local HEAD.

## User stories / use cases

1. As an author — I cut `make-my-new-lump`, `lump-plan`, `lumpcode run`. The agent writes on this branch. I inspect, type `e` or Ctrl+C, edit the lump, run again. When happy I type `c` (LUMP commit, no push) and push the authoring branch myself.
2. As an author on `dev` / `main` — shared `run` still works and warns that a later accepted commit I push will mark contexts finished on `origin/<resolvedBaseBranch>`.
3. As an author — I `lump-plan` and `run` while dirty. Both work. Detached HEAD fails `run` only.
4. As an operator — I leave a worker in dedicated and `start`. The laptop in shared cannot `start`.
5. As an author — I accepted a LUMP commit too early. `lump-status` is still `toDo` until I push. The next `run` walks those contexts again, or I `git reset` the commit.

## Proposed behavior and UX

### Modes

| Mode | `lumpcode run` | `lumpcode start` / `restart` / `start --superviseOnly` |
| --- | --- | --- |
| `shared` | In-place rehearsal (this section) | Fail `sharedModeNoDaemon` |
| `dedicated` | Unchanged | Unchanged |

### Shared `run` walk

After load + disabled skip, before workspace setup, in `runLumpFromJsConfig` when `mode === 'shared'`:

1. `assertSharedRunHead` on `sourceProjectRoot`. Fail only if HEAD is detached (not a named branch). Dirty porcelain is allowed.
2. If current branch equals `resolvedBaseBranch` (`resolveLumpBaseBranch`, exact string), log the on-base warning once. Do not fail.
3. Do not call `runProjectPreflight` / `runPreflight`. Do not create `project-copies`.
4. `getExecutionWorkspacePath` returns `sourceProjectRoot` in both modes.
5. Skip `evaluateTooManyOpenBranchesSkip` (no `lump/…` created).
6. Path lock the source checkout (`lockMode: 'fail'`).
7. `setupWorkspaceFn` / `teardownWorkspaceFn`: no git. `workspacePath` = `sourceProjectRoot`.
8. `branchFn` returns the current branch name (not `lump/<lumpName>/…`).
9. `gitAddCommitFn` / `gitPushFn` are no-ops (`success(undefined)`).
10. No dedicated restore-branch `finally`.

### On-base warning (exact)

Compare `branchName` from `assertSharedRunHead` to `resolvedBaseBranch`. Not a glob. Not “any `primaryBranches` entry.”

```text
You are on the execution base (${resolvedBaseBranch}). A LUMP commit you accept, then push, will mark contexts finished on origin/${resolvedBaseBranch}.
```

### Shared `run` review (`commands/run` only)

After `runLumpFromLumpName` success, dispose `installRunAbortHandlers`, then if `shouldPromptSharedRunReview`:

| Condition | Behavior |
| --- | --- |
| TTY and not `--json` | Print porcelain (`git status --porcelain`), then `[c]` / `[e]` |
| `!stdin.isTTY` or `--json` | Implicit `e` (success, no commit, no porcelain dump) |
| Skip / 0 contexts / walk failure | No prompt |

| Input | Effect |
| --- | --- |
| `c` / `C` | `commitSharedRunReview` (`git add .` + one `--allow-empty` commit, no push) |
| `e` / `E` | Success, leave dirty |
| Other keys | Re-print the menu |
| Ctrl+C or EOF | Same as `e` (success, not exit 130) |

Prompt copy (TTY):

```text
These changes will be committed if you choose c:
<porcelain lines, or nothing if clean>

Verify the updates.
  [c] Commit with the LUMP marker (does not push)
  [e] Exit without committing — edit the lump and run again
```

`c` commit message: `getGitCommitMessage({ lumpName, contextName })` for every `result.contextNames`, joined by `\n\n`. Staging is `git add .` (whole tree).

After successful `c`, also print:

```text
Committed LUMP markers for: <comma-separated contextNames>
Contexts stay toDo until you push this branch. The next lumpcode run will pick them again.
```

Then the usual `SUCCESS: Lump run successfully`. If `c` fails, do not print SUCCESS.

### Failures (shared `run`)

CLI `Failure` envelope `messages: [string]`. `--json` includes `data.code`.

| `data.code` | When | Message (exact) |
| --- | --- | --- |
| `detachedHead` | not on a named branch | `Not on a branch. Shared run needs a named branch.` |
| `sharedRunCommitFailed` | `c` then git add/commit fails | git stderr (or one-liner plus stderr) |

No `dirtyWorkTree`. Walk failures keep their existing reasons. `e` and implicit-exit are success.

### Daemon refuse (shared)

| `data.code` | Commands | Message (exact) |
| --- | --- | --- |
| `sharedModeNoDaemon` | `start`, `start --superviseOnly`, `restart` | `lumpcode start is dedicated-only. Use a worker clone with mode: dedicated, or lumpcode run on this laptop.` |

`stop`, `stop --all`, `daemon-status`, `daemon-log` unchanged (reap leftovers).

### `openPrPostTeardown`

Skip unless `branchName` starts with `lump/`. Shared never opens a PR. Dedicated unchanged.

### `refreshCommand`

Dedicated daemon tick only. Shared `run` does not exec it. `validateDaemonLaunch` and dedicated manual `run` still omit it.

### Shared `workspaceStrategy` / `maxParallelRun`

No effect on shared `run` (one checkout). Do not fail start for these: start already fails `sharedModeNoDaemon`.

### Status (unchanged rules)

`getContextStatus` scans `origin` remotes. A local LUMP commit does not change status. After the author pushes the current branch: `branchPushed`, or `finished` if that branch is `origin/<base>`. Next shared `run` before push walks those contexts again.

## Technical approach

Canonical owners. Callers must not reimplement.

| Concern | Owner | Non-owners |
| --- | --- | --- |
| Detached HEAD | `packages/apps/cli/src/utils/assertSharedRunHead/` (`assertSharedRunHead({ cwd }) → Success<{ branchName: string }> \| Failure<{ code: 'detachedHead'; message: string }>`) called from `runLumpFromJsConfig` when `mode === 'shared'` | `commands/run`, `runPreflight` |
| On-base warn | Same `runLumpFromJsConfig` moment: `branchName === resolvedBaseBranch` | Command modules |
| Shared git no-ops | `jsConfigToRunLumpInput` when `mode === 'shared'`: `gitAddCommitFn` / `gitPushFn` → `success(undefined)` | Core |
| Shared in-place workspace + `branchFn` | `jsConfigToRunLumpInput` + `makeLumpWorkspaceFns` when `mode === 'shared'` | `runPreflight` |
| Skip copy / skip preflight | `runLumpFromJsConfig` / `withWorkspaceLockHooks`: shared does not call `runProjectPreflight` | Phase 1 dedicated discovery |
| `getExecutionWorkspacePath` | That util: both modes return `sourceProjectRoot` | Do not special-case `project-copies` at new call sites |
| Review predicate | `shouldPromptSharedRunReview({ mode, run })` | Inline in other commands |
| Prompt | `promptSharedRunReview` | `runLumpFromJsConfig`, `runLumpFromLumpName`, daemon tick |
| LUMP commit | `commitSharedRunReview` | Core, command modules other than `run` |
| Call prompt then maybe commit | `commands/run` after successful `runLumpFromLumpName` | Phase 1 / phase 2 utils |
| Daemon refuse | `assertDedicatedDaemonRequired({ mode }) → Success<void> \| Failure<{ code: 'sharedModeNoDaemon'; message: string }>` | Not inside `assertDaemonStartAllowed` (pid/meta only) |
| Start / superviseOnly / restart call the owner | `commands/start` after merged local config (all paths including `--superviseOnly`); `launchStartDaemon` (covers `restart`) | Companions `stop`, `daemon-status` |
| Open-PR skip | `openPrPostTeardown` in `@lumpcode/recipes` | CLI must not duplicate the `lump/` prefix check |
| Remove shared copy path | `runPreflight`: dedicated-only reset. Delete `ensureProjectCopy` / origin-sync. | — |

Contracts:

```ts
type SharedRunReviewChoice = 'commit' | 'exit';

function assertSharedRunHead(input: { cwd: string }): Promise<
  Success<{ branchName: string }> | Failure<{ code: 'detachedHead'; message: string }>
>;

function shouldPromptSharedRunReview(input: {
  mode: 'shared' | 'dedicated';
  run: RunLumpFromLumpNameSuccess;
}): boolean; // shared && !skipped && result.contextNames.length > 0

function promptSharedRunReview(input: {
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
  json: boolean;
  porcelainLines: string[];
}): Promise<Success<SharedRunReviewChoice>>;

function commitSharedRunReview(input: {
  cwd: string;
  lumpName: string;
  contextNames: string[];
}): Promise<Success<void> | Failure<{ code: 'sharedRunCommitFailed'; message: string }>>;

function assertDedicatedDaemonRequired(input: { mode: 'shared' | 'dedicated' }):
  Success<void> | Failure<{ code: 'sharedModeNoDaemon'; message: string }>;
```

Ordered steps: implement tickets in dependency order (`in-place-workspace` first; `shared-run-review` after it; docs last). Do not document in-place shared `run` until behavior matches.

## Testing strategy

### Unit

| Area | Where | Proves |
| --- | --- | --- |
| Detached / named branch | `assertSharedRunHead/unit.test.ts` | detached fails; named branch succeeds including dirty and ignored-only |
| Shared `run` walk | `runLumpFromLumpName` / `runLumpFromJsConfig` / `jsConfigToRunLumpInput` suites | no `runProjectPreflight`; `workspacePath` = source; `branchFn` = current branch; dirty allowed; detached fails; on-base warns and runs; git fns no-op; skip open-branch cap; no prompt |
| Review predicate + prompt + commit | `shouldPromptSharedRunReview` / `promptSharedRunReview` / `commitSharedRunReview` suites | TTY `c`/`e`; implicit exit; multi-marker message; commit fail code |
| `commands/run` | `commands/run` suite | prompt only after success with contexts; abort handlers disposed; `c` fail is command Failure |
| Start refuse | `commands/start` (incl. T7 / S1 / G7 / `--superviseOnly`) | `sharedModeNoDaemon`; discover/refresh not called |
| Restart refuse | `commands/restart` | same code |
| Preflight | `runPreflight/unit.test.ts` | no copy; dedicated reset unchanged |
| `getExecutionWorkspacePath` | its unit test | shared == source |
| Open PR | recipes `openPrPostTeardown` tests | skip non-`lump/` branch; dedicated `lump/` still opens |

### Integration / E2E

Update CLI e2e shared fixtures: no `project-copies`; agent cwd is the fixture repo; no auto push. Dedicated e2e unchanged. Non-TTY / `--json` e2e: walk succeeds, no LUMP commit.

Invert or delete tests that require a shared copy, shared `start` success, dirty-fail on shared `run`, or auto commit/push on shared `run`.

## Docs updates

Jobs, not mode names, on user surfaces. `shared` / `dedicated` only next to `local.json`. No `project-copies`. No “never touches this checkout.” Laptop `run` does not create `lump/…` and does not commit or push unless the author types `c` (commit only). Worker still cuts `lump/…`. Do not write **production** on the landing page.

| Document | Change |
| --- | --- |
| `packages/apps/website` First PR | Rehearse on this branch (dirty ok); `run`; verify; `c` to stamp LUMP markers; you push. Then worker. Drop copy / `lump/…` as the first-run PR. |
| Worker page | Laptop run was rehearsal; this clone is the campaign. Dedicated unchanged. |
| Landing | Hero unchanged. Do not teach rehearsal in the hero. Worker loop still “branch you open as a PR.” |
| `/docs/config/local`, `/docs/start/run`, `/docs/start/terms`, `/docs/author/write-a-lump`, `/docs/author/agents` | In-place shared; start dedicated-only; review prompt; dirty allowed; no auto push. |
| `docs-shared-installation-guide` (docs lump) | Must not contradict. Align or fold into `shared-in-place-docs`. |
| `packages/apps/cli/DOCS/` `concepts.md`, `local-config.md`, `commands.md`, `project-config.md`, `get-started.md`, `advanced-config.md` | Three workspaces: shared project = execution. `start` dedicated-only. `refreshCommand` dedicated tick only. Dirty allowed. Review `c`/`e`. |
| `articles/05-hands-on-dedicated-daemon` | Kill “checkout untouched” and “review `lump/…` before the daemon.” Laptop `run` on the authoring branch; then merge; worker `lump/…`. |
| `articles/07-setup-abstraction-campaign` | Same laptop line. |
| `articles/01-dedicated-lumpcode-worker` | Worker-only. No laptop copy. |
| `AGENTS.md` | Shared in-place; no auto commit/push; review only in `commands/run`; `getExecutionWorkspacePath` both modes = source; no shared `start`; no shared copy. |

## Acceptance criteria

1. Shared `run` on a named branch (clean or dirty) writes on this checkout. No `project-copies` dir is created. No `lump/…` ref is created. No commit or push unless the author types `c` on a TTY without `--json`.
2. Shared `run` on detached HEAD exits `detachedHead` before agent writes.
3. Shared `run` on `resolvedBaseBranch` succeeds and logs the on-base warning.
4. After a successful walk with contexts, TTY (not `--json`) shows porcelain + `c`/`e`. `e` and Ctrl+C leave dirty and exit 0. `c` creates one multi-marker LUMP commit and does not push.
5. `--json` or non-TTY: walk success, no prompt, no commit.
6. `c` then git failure: `sharedRunCommitFailed`, no SUCCESS line.
7. After `c` and before push, `lump-status` is `toDo`. Next `run` walks those contexts again. After the author pushes a non-base branch: `branchPushed`. After push on the base: `finished`.
8. Dedicated `run` / `start` / tick / `refreshCommand` / `lump/…` / hard reset unchanged.
9. Shared `start`, `start --superviseOnly`, and `restart` fail `sharedModeNoDaemon`. `stop` still works.
10. `openPrPostTeardown` does not open a PR when `branchName` lacks the `lump/` prefix.
11. `lump-plan` still runs on a dirty shared checkout.
12. Docs/website/articles listed above match shipped behavior. Zero user-facing “project copy” / “never touches this checkout” for shared `run`.
13. No second detached check, start-mode check, or `lump/` PR skip outside the named owners. No prompt outside `commands/run`.

## Reference: shared `run` vs dedicated

```text
shared:  detached? → lock source → agent cwd = source → no git → (run cmd) c/e
dedicated: lock → preflight reset → lump/… branch → agent → push lump/… → restore
```
