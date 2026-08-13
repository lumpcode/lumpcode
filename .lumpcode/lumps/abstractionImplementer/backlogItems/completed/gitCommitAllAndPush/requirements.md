# Requirements: `gitCommitAllAndPush` — stage, commit-or-empty, push git fixture util

| Field | Value |
| --- | --- |
| **Backlog** | `gitCommitAllAndPush` · priority **6** · type **feature** |
| **Status** | Pending implementation |
| **Depends on** | `execGit` |
| **Packages** | `packages/apps/cli` (primary); `@lumpcode/core` unchanged |

## Problem statement and motivation

CLI tests, shared fixtures, and the e2e harness repeatedly stage changes, commit (falling back to an empty commit when the tree is clean), and push to `origin`. The same **try-commit / catch-empty-commit** skeleton is copy-pasted with only `cwd`, message, branch, and staging scope varying.

Pain points:

1. **Identical private helpers** — `gitCommitAll` is duplicated verbatim in `validateDaemonLaunch/unit.test.ts` and `discoverDedicatedLumpsForScanBranch/unit.test.ts` (each still uses raw `execSync` instead of `execGit`).
2. **E2e parallel** — `createE2eProject.ts` defines `commitAndPushMain` and `gitCommitIntegrationBranch` with the same try/catch commit body.
3. **Fixture drift** — `createIntegrationBranch` in `testing/multiBranchFixtures.ts` inlines the try/catch block after selective `git add`.
4. **Inconsistent git entrypoint** — some call sites use `execSync`, others `execGit`; centralizing on `execGit` keeps encoding and trimming consistent.

### Repeated pattern

```text
git add -A                          # sometimes omitted when paths pre-staged
try   git commit -m <message>
catch git commit --allow-empty -m <message>
git push origin <branch>            # sometimes `push -u origin <branch>`
```

## Goals

1. Add `packages/apps/cli/src/utils/gitCommitAllAndPush/` as the canonical sync git fixture helper.
2. Export a small companion `gitCommitOrAllowEmpty` from the same module for call sites that only need the try/catch commit step.
3. Refactor all call sites listed below to import the util (remove local `gitCommitAll`, `commitAndPushMain` bodies, and inline try/catch blocks).
4. Achieve **net line reduction** across `packages/apps/cli` (excluding the new util's `unit.test.ts`).
5. Add focused unit tests (mock/spy on `execGit`).

## Non-goals

- Async git (`execAsync`) or production command-handler git usage.
- Replacing bare `execGit('commit --allow-empty …')` one-liners used for deterministic empty commits in other tests.
- Moving the util to `@lumpcode/core`.
- General-purpose git wrappers for log, fetch, checkout, or branch listing.
- Changing commit messages, branches, or push semantics at any call site.

## User stories / use cases

1. As a **unit-test author** — I need to push fixture commits after writing lump configs, so dedicated pre-flight sees them on `origin/main`.
2. As an **e2e harness maintainer** — I need one helper for “commit pending work on main” without duplicating empty-commit fallback logic.
3. As a **fixture maintainer** — I need commit-or-empty after selective `git add` when creating integration branches.

## Proposed behavior and UX

**Directory:** `packages/apps/cli/src/utils/gitCommitAllAndPush/`

### `gitCommitOrAllowEmpty`

```typescript
/** Run `git commit -m …`; on non-zero exit, run `git commit --allow-empty -m …`. */
export function gitCommitOrAllowEmpty(input: {
    cwd: string;
    message: string;
}): void;
```

- `message` is passed to git via `JSON.stringify(message)` in the `-m` argument (same quoting as today).
- Propagates `execGit` / `execSync` errors from the second commit attempt.

### `gitCommitAllAndPush`

```typescript
export function gitCommitAllAndPush(input: {
    cwd: string;
    message: string;
    /** Remote branch to push. Default: `'main'`. */
    branch?: string;
    /** When `true` (default), run `git add -A` before commit. */
    stageAll?: boolean;
    /** When `true`, run `git push -u origin <branch>` instead of `git push origin <branch>`. */
    setUpstream?: boolean;
}): void;
```

### Semantics

| Step | When |
| --- | --- |
| `git add -A` | `stageAll !== false` |
| `gitCommitOrAllowEmpty` | always |
| `git push origin <branch>` | `setUpstream !== true` |
| `git push -u origin <branch>` | `setUpstream === true` |

All git steps delegate to `execGit` (not raw `execSync`).

### Caller mapping

| Today | After |
| --- | --- |
| `gitCommitAll(cwd, message)` in two unit tests | `gitCommitAllAndPush({ cwd, message })` |
| `commitAndPushMain(project, message)` | `gitCommitAllAndPush({ cwd: project.projectRoot, message })` (re-export or thin wrapper in `createE2eProject.ts` optional if import path stability matters) |
| `gitCommitIntegrationBranch(projectRoot, branchName)` | `gitCommitOrAllowEmpty({ cwd: projectRoot, message: \`integration ${branchName}\` })` |
| `createIntegrationBranch` try/catch commit | `gitCommitOrAllowEmpty({ cwd: projectRoot, message: \`integration branch ${branchName}\` })` then existing `push -u` / `checkout` |
| `commands/run/unit.test.ts` add/commit/push without empty fallback | `gitCommitAllAndPush({ cwd: projectRoot, message: 'main lump' })` for consistent behavior |

## Technical approach

| Step | Files | Contract |
| --- | --- | --- |
| 1 | `utils/gitCommitAllAndPush/main.ts`, `index.ts` | Implement helpers above using `execGit` |
| 2 | `utils/index.ts` | Barrel-export both functions |
| 3 | `utils/validateDaemonLaunch/unit.test.ts`, `utils/discoverDedicatedLumpsForScanBranch/unit.test.ts` | Delete local `gitCommitAll`; import util; drop unused `execSync` import |
| 4 | `e2e/harness/createE2eProject.ts` | Replace `commitAndPushMain` / `gitCommitIntegrationBranch` bodies with util calls |
| 5 | `testing/multiBranchFixtures.ts` | Replace inline try/catch in `createIntegrationBranch` |
| 6 | `commands/run/unit.test.ts` | Adopt util where the add/commit/push block matches |

## Testing strategy

| Level | Covers |
| --- | --- |
| **Unit** (`utils/gitCommitAllAndPush/unit.test.ts`) | `gitCommitOrAllowEmpty` calls `execGit` with `commit -m …` then `commit --allow-empty -m …` when first throws; `gitCommitAllAndPush` invokes `add -A`, commit helper, and `push origin main` by default; honors `stageAll: false`, `branch`, `setUpstream` |
| **Integration** | Existing suites in refactored files (`validateDaemonLaunch`, `discoverDedicatedLumpsForScanBranch`, `run` command tests, e2e `createE2eProject` consumers) — no behavior change |

No production command `main.ts` files change.

## Docs updates

None (internal test/fixture util).

## Acceptance criteria

- [ ] `gitCommitAllAndPush` and `gitCommitOrAllowEmpty` exported from `utils/index.ts`; layout `main.ts` + `index.ts`.
- [ ] No remaining private `gitCommitAll` definitions in `packages/apps/cli/src`.
- [ ] `commitAndPushMain` and `gitCommitIntegrationBranch` in `createE2eProject.ts` delegate to the util (or are removed in favor of direct imports).
- [ ] `createIntegrationBranch` no longer inlines try/catch commit logic.
- [ ] All refactored unit and e2e tests pass with identical git history semantics.
- [ ] **Net reduction:** lines removed from call sites minus `main.ts` + `index.ts` + barrel export is **≥ 25 lines** (`git diff --numstat` on `packages/apps/cli`, excluding `utils/gitCommitAllAndPush/unit.test.ts`).
- [ ] Unit tests mock/spy `execGit` and assert subcommand sequences without requiring a real git repo.

## dependsOn

- **`execGit`** — util must call the shared sync git helper; do not duplicate `execSync` wiring.
