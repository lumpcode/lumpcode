# Requirements: `initBareRemoteAndCheckout` — bare remote + local checkout fixture util

| Field | Value |
| --- | --- |
| **Backlog** | `initBareRemoteAndCheckout` · priority **7** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | `execGit`, `initLocalGitRepo` |
| **Packages** | `packages/apps/cli` (primary); `@lumpcode/core` unchanged |

## Problem statement and motivation

Many CLI unit tests need a **local git repo with a bare `origin` and an initial `main` push** so preflight, status, and push-based fixtures work. The same seven-command sequence is copy-pasted across modules, while `testing/multiBranchFixtures.ts` already owns a shared `initBareRemoteAndCheckout` that only some tests import.

Pain points:

1. **Identical private helpers** — `initRepoWithRemote` in `utils/runPreflight/unit.test.ts` and the inline block in `commands/start/testing/testHelpers.ts` `setupStartTestRepo` duplicate the testing helper almost verbatim.
2. **Scattered `beforeEach` blocks** — at least ten more unit tests inline the same bare-init → local-init → identity → empty commit → `remote add` → `push -u` sequence.
3. **Fixture drift** — the testing helper also hand-rolls `.gitignore` for `.lumpcode/local.json`; most inline copies omit it. Canonicalizing the **git** steps stops new copies from reinventing the sequence.
4. **Layering gap** — `initLocalGitRepo` (priority 4) is designed to own the middle four commands; this util is the natural outer wrapper for bare remote + push.

### Repeated pattern

```text
git init --bare <remoteDir>
git init -b main <projectRoot>          # via initLocalGitRepo
git config user.email / user.name       # via initLocalGitRepo
git commit --allow-empty -m "init"      # via initLocalGitRepo
git remote add origin <remoteDir>
git push -u origin main
```

### Call sites today

| Location | Form today |
| --- | --- |
| `testing/multiBranchFixtures.ts` | `initBareRemoteAndCheckout` (canonical; also sync-appends `.gitignore`) |
| `utils/runPreflight/unit.test.ts` | Private `initRepoWithRemote` (7 commands, no gitignore) |
| `commands/start/testing/testHelpers.ts` | Inline in `setupStartTestRepo` |
| `utils/setContextToFinishedStatus/unit.test.ts` | Inline `beforeEach` |
| `utils/runLumpFromLumpName/unit.test.ts` | Inline `beforeEach` |
| `utils/runLumpFromJsConfig/unit.test.ts` | Inline `beforeEach` |
| `utils/countOpenLumpBranches/unit.test.ts` | Inline `beforeEach` |
| `utils/buildContextStatusRecord/unit.test.ts` | Inline `beforeEach` |
| `utils/makeLumpWorkspaceFns/unit.test.ts` | Inline integration `beforeEach` |
| `utils/planLumpFromJsConfig/unit.test.ts` | Inline in one capacity test |
| `commands/clean/unit.test.ts` | Inline `beforeEach` |
| `commands/lump-status/unit.test.ts` | Inline `beforeEach` |
| `commands/context-status/unit.test.ts` | Inline `beforeEach` |

Callers that **already** import `initBareRemoteAndCheckout` from `testing/` (`validateDaemonLaunch`, `runProjectPreflight`, `resolveEffectiveDiscoveryBranch`, `discoverDedicatedLumpsForScanBranch`, `commands/run/unit.test.ts`, parts of `lump-plan` / `lump-status`, `scaffoldMultiBranchProject`) keep working via a thin `testing` re-export; no behavior change required beyond the move.

**~13** full seven-command copies (or private wrappers) plus several re-export consumers.

## Goals

1. Add `packages/apps/cli/src/utils/initBareRemoteAndCheckout/` as the canonical sync fixture for bare remote + local checkout + initial push.
2. Implement on top of `initLocalGitRepo` + `execGit` (no raw `execSync` for these steps).
3. Thin `testing/multiBranchFixtures.ts`: `initBareRemoteAndCheckout` delegates to the util (preserve the `testing` barrel export name).
4. Delete `initRepoWithRemote`; refactor all inline seven-command blocks listed above to one util call.
5. Achieve **net line reduction** across `packages/apps/cli` (excluding the new util's `unit.test.ts`).
6. Add focused unit tests (spy/mock `execGit` / `initLocalGitRepo`).

## Non-goals

- E2e `createE2eProject` bootstrap: it writes files then `git add -A` + real `commit` (not empty-commit bootstrap). Out of scope.
- `commands/project-setup/unit.test.ts` cases that only `init --bare` + `remote add` + `push` on an already-bootstrapped local repo.
- Production / async git (`execAsync`, preflight, workspace fns).
- Moving the util to `@lumpcode/core`.
- Replacing callers that already use the testing helper with a different API — keep the same function name at the testing re-export.
- Owning `.lumpcode/` JSON scaffolds (`writeLocalJson`, `writeProjectJson`, `writeLumpConfigJson`).

## User stories / use cases

1. As a **unit-test author** — I need a temp project with `origin/main` already pushed so dedicated preflight and status helpers see remote refs.
2. As a **start-command test helper author** — I need the same remote+local setup inside `setupStartTestRepo` without a private seven-line block.
3. As a **fixture maintainer** — I need one canonical owner under `utils/` so `testing/` re-exports instead of owning the git sequence.

## Proposed behavior and UX

**Directory:** `packages/apps/cli/src/utils/initBareRemoteAndCheckout/`

```typescript
export function initBareRemoteAndCheckout(input: {
    projectRoot: string;
    remoteDir: string;
    /** Initial branch for local repo and `push -u`. Default: `'main'`. */
    branch?: string;
    /** Forwarded to `initLocalGitRepo`. Default: `'test@test.com'`. */
    userEmail?: string;
    /** Forwarded to `initLocalGitRepo`. Default: `'Test'`. */
    userName?: string;
    /** Forwarded to `initLocalGitRepo`. Default: `'init'`. */
    initialCommitMessage?: string;
}): void;
```

### Semantics

- Synchronous.
- Steps (in order):
  1. `execGit('init --bare', remoteDir)`
  2. `initLocalGitRepo({ cwd: projectRoot, branch, userEmail, userName, initialCommitMessage })`
  3. `execGit('remote add origin <remoteDir>', projectRoot)` — pass `remoteDir` as a path argument suitable for the existing sync git helper (same quoting/path style as today's inline `` `remote add origin ${remoteDir}` ``)
  4. `execGit('push -u origin <branch>', projectRoot)` with the same `branch` default `'main'`
- Does **not** write `.gitignore`, `.lumpcode/`, or working-tree files. Gitignore for `.lumpcode/local.json` stays with `writeLocalJson` / `appendMissingGitignoreLines`.
- Propagates errors from `execGit` / `initLocalGitRepo` (same as today's inline blocks).

### Testing re-export

`testing/multiBranchFixtures.ts` keeps exporting `initBareRemoteAndCheckout(projectRoot, remoteDir)` with the **existing two-arg positional signature** for call-site stability. Body:

- Call the util with `{ projectRoot, remoteDir }`.
- Optionally keep today's best-effort `.gitignore` append for `.lumpcode/local.json` **only in the testing wrapper**, preferably via `appendMissingGitignoreLines` (sync path may use `fsSync` as today, or await if the wrapper becomes async — prefer keeping the testing export sync; if `appendMissingGitignoreLines` is async-only, keep a minimal sync append or drop gitignore from the wrapper when all consumers already call `writeLocalJson`). Prefer: drop wrapper gitignore when every consumer that needs it already calls `writeLocalJson`; otherwise keep sync append for parity.

## Technical approach

| Step | Change |
| --- | --- |
| 1 | Add `utils/initBareRemoteAndCheckout/{main.ts,index.ts}` and barrel-export from `utils/index.ts`. |
| 2 | Implement using `execGit` + `initLocalGitRepo` only. |
| 3 | Point `testing/multiBranchFixtures.ts` at the util; keep positional re-export. |
| 4 | Replace `initRepoWithRemote` and all inline seven-command blocks in the call-site table with util (or testing re-export) calls. |
| 5 | Add `unit.test.ts` for the util. |

### Affected files

| File | Change |
| --- | --- |
| `packages/apps/cli/src/utils/initBareRemoteAndCheckout/main.ts` | New util |
| `packages/apps/cli/src/utils/initBareRemoteAndCheckout/index.ts` | Re-export |
| `packages/apps/cli/src/utils/initBareRemoteAndCheckout/unit.test.ts` | Coverage |
| `packages/apps/cli/src/utils/index.ts` | Barrel export |
| `packages/apps/cli/src/testing/multiBranchFixtures.ts` | Delegate to util |
| All modules in the call-site table above | One-call setup; delete private helpers |

**Canonical owner:** only `utils/initBareRemoteAndCheckout` implements the bare+push sequence. Callers and `testing/` must not reintroduce private `initRepoWithRemote`-style copies.

## Testing strategy

| Level | What |
| --- | --- |
| Unit (`utils/initBareRemoteAndCheckout/unit.test.ts`) | Defaults call `init --bare`, `initLocalGitRepo` with expected args, `remote add origin`, `push -u origin main`. Overrides for `branch` / identity forward correctly. No `.gitignore` / filesystem config writes. |
| Integration (existing suites) | Refactored `beforeEach` / helpers still pass; no new e2e required. |

Update imports in refactored tests to `../../utils` / `../../../utils` (or keep `testing` re-export) to match surrounding style.

## Docs updates

None. Test/fixture helper only; not operator-facing.

## Acceptance criteria

### Behavior

- [ ] All refactored unit tests and start helpers produce an equivalent repo: bare `remoteDir`, local `projectRoot` on `branch` (default `main`), `origin` remote, and `origin/<branch>` containing the initial commit.
- [ ] `testing` barrel still exports `initBareRemoteAndCheckout` (positional two-arg form).
- [ ] No private `initRepoWithRemote` (or equivalent seven-command local helper) remains under `packages/apps/cli/src`.
- [ ] Full `packages/apps/cli` unit test suite passes.

### `initBareRemoteAndCheckout` unit tests

- [ ] With defaults, invokes bare init, `initLocalGitRepo({ cwd: projectRoot })` (or equivalent default args), `remote add origin`, and `push -u origin main`.
- [ ] Honors `branch`, `userEmail`, `userName`, `initialCommitMessage`.
- [ ] Does not write project JSON / local JSON / lump configs.

### Line count

- [ ] **Net reduction** across `packages/apps/cli` excluding `utils/initBareRemoteAndCheckout/unit.test.ts` (target: each seven-line block → one call; util body small; remove `initRepoWithRemote`).
- [ ] Measure with `git diff --numstat` on `packages/apps/cli` excluding the new util's `unit.test.ts`.

### Conventions

- [ ] Util layout: `main.ts` + `index.ts`, exported from `utils/index.ts`.
- [ ] Single destructured object argument; `function` declaration.
- [ ] Implemented only after `execGit` and `initLocalGitRepo` land; no duplicated `execSync` wiring.
- [ ] No second bare-remote bootstrap helper outside this util (testing may only re-export / thin-wrap).

## dependsOn

- **`execGit`** — sync git entrypoint for bare init, remote add, and push.
- **`initLocalGitRepo`** — local `init -b` + identity + empty initial commit.
