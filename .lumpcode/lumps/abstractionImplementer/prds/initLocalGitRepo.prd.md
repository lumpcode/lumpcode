# PRD: `initLocalGitRepo` — local git repository bootstrap util

| Field | Value |
| --- | --- |
| **Backlog** | `initLocalGitRepo` (priority 4) |
| **Status** | Pending implementation |
| **Package** | `packages/apps/cli` only |
| **dependsOn** | `execGit` |

## Problem statement and repeated pattern

After creating a temp directory, CLI unit tests, shared fixtures, and the e2e harness repeatedly run the same **four git commands** to make a commit-ready working tree:

```typescript
git('init -b main', cwd);
git('config user.email "test@test.com"', cwd);
git('config user.name "Test"', cwd);
git('commit --allow-empty -m "init"', cwd);
```

The skeleton is identical across call sites. Only `cwd`, the initial branch name, and occasionally `user.email` / `user.name` differ (e.g. e2e uses `e2e@t.com`). Many files also define a private `function git(cmd, cwd)` solely to support this block — that duplication is addressed separately by `execGit`; this util captures the **semantic fixture step** on top of it.

### Call sites today

| Location | Occurrences | Notes |
| --- | --- | --- |
| `commands/stop/unit.test.ts` | 1 | `beforeEach` |
| `commands/start/unit.test.ts` | 3 | multiple `describe` blocks |
| `commands/restart/unit.test.ts` | 1 | `beforeEach` |
| `commands/project-setup/unit.test.ts` | 2 | main + nested repo |
| `commands/lump-status/unit.test.ts` | 1 | `beforeEach` |
| `commands/lump-plan/unit.test.ts` | 1 | `beforeEach` |
| `commands/lump-create/unit.test.ts` | 1 | `beforeEach` |
| `commands/daemon-status/unit.test.ts` | 1 | `beforeEach` |
| `commands/daemon-log/unit.test.ts` | 1 | `beforeEach` |
| `commands/context-status/unit.test.ts` | 1 | `beforeEach` |
| `commands/clean/unit.test.ts` | 1 | `beforeEach` |
| `utils/setContextToFinishedStatus/unit.test.ts` | 1 | `beforeEach` |
| `utils/runPreflight/unit.test.ts` | 1 | inside `initRepoWithRemote` |
| `utils/runLumpFromLumpName/unit.test.ts` | 1 | `beforeEach` |
| `utils/runLumpFromJsConfig/unit.test.ts` | 1 | `beforeEach` |
| `utils/planLumpFromJsConfig/unit.test.ts` | 1 | `beforeEach` |
| `utils/makeLumpWorkspaceFns/unit.test.ts` | 1 | integration setup |
| `utils/countOpenLumpBranches/unit.test.ts` | 1 | `beforeEach` |
| `utils/buildContextStatusRecord/unit.test.ts` | 1 | `beforeEach` |
| `testing/multiBranchFixtures.ts` | 1 | `initBareRemoteAndCheckout` (via `gitExec`) |
| `e2e/harness/createE2eProject.ts` | 1 | project bootstrap |

**22** copies of the `init -b` line (21 files; `start/unit.test.ts` has three). Each copy is a four-line block → **88 lines** of repeated setup today.

Larger helpers (`initBareRemoteAndCheckout`, `initRepoWithRemote`) embed this block before `remote add` / `push`; they should call `initLocalGitRepo` for the shared portion rather than inlining the four commands.

## Goals

1. Add `packages/apps/cli/src/utils/initLocalGitRepo/` with one exported function that runs the standard bootstrap via `execGit`.
2. Refactor **all** call sites listed above to call `initLocalGitRepo({ cwd })` (with optional overrides where a site uses non-default identity or branch).
3. Achieve **net line reduction** across `packages/apps/cli` (excluding the new util's `unit.test.ts`).
4. Add focused unit tests that assert the util invokes the expected git subcommands (mock or spy on `execGit`).

## Non-goals

- Replacing `init --bare` setup, `remote add`, or `push` steps (remain in `initBareRemoteAndCheckout`, `initRepoWithRemote`, e2e helpers).
- Async git (`execAsync`) or production command-handler git usage.
- Moving the util to `@lumpcode/core`.
- Collapsing unrelated test fixture prose (`minimalLumpConfigJson`, `writeLocalJson`, daemon spawn helpers) — only the four-command bootstrap.
- Implementing before `execGit` lands; this PRD assumes `execGit` is available.

## Proposed util API

**Directory:** `packages/apps/cli/src/utils/initLocalGitRepo/`

```typescript
export function initLocalGitRepo(input: {
    cwd: string;
    /** Initial branch. Default: `'main'`. */
    branch?: string;
    /** Default: `'test@test.com'`. */
    userEmail?: string;
    /** Default: `'Test'`. */
    userName?: string;
    /** Initial commit message. Default: `'init'`. */
    initialCommitMessage?: string;
}): void;
```

### Semantics

- Synchronous; delegates to `execGit` for each step:
  1. `init -b <branch>`
  2. `config user.email "<userEmail>"`
  3. `config user.name "<userName>"`
  4. `commit --allow-empty -m "<initialCommitMessage>"`
- Does not create remotes, push, or write `.lumpcode/` files.
- Propagates `execSync` errors from `execGit` (same as today's inline blocks).

### Caller adaptation

**Typical unit test `beforeEach`:**

```typescript
// before (4 lines)
git('init -b main', projectRoot);
git('config user.email "test@test.com"', projectRoot);
git('config user.name "Test"', projectRoot);
git('commit --allow-empty -m "init"', projectRoot);

// after (1 line)
initLocalGitRepo({ cwd: projectRoot });
```

**E2e project bootstrap:**

```typescript
initLocalGitRepo({ cwd: projectRoot, userEmail: 'e2e@t.com' });
```

**`initBareRemoteAndCheckout` (after `execGit` refactor):**

```typescript
gitExec('init --bare', remoteDir);
initLocalGitRepo({ cwd: projectRoot });
gitExec(`remote add origin ${remoteDir}`, projectRoot);
gitExec('push -u origin main', projectRoot);
```

## Affected files

### Add

| File | Purpose |
| --- | --- |
| `packages/apps/cli/src/utils/initLocalGitRepo/main.ts` | Implementation |
| `packages/apps/cli/src/utils/initLocalGitRepo/index.ts` | Re-export |
| `packages/apps/cli/src/utils/initLocalGitRepo/unit.test.ts` | Vitest coverage |

### Modify

| File | Change |
| --- | --- |
| `packages/apps/cli/src/utils/index.ts` | Barrel-export `initLocalGitRepo` |
| All 21 modules in the call-site table | Replace four-line bootstrap with `initLocalGitRepo` |
| `testing/multiBranchFixtures.ts` | Use `initLocalGitRepo` inside `initBareRemoteAndCheckout` |
| `utils/runPreflight/unit.test.ts` | Use inside `initRepoWithRemote` |

## Acceptance criteria

### Behavior

- [ ] All refactored tests and e2e fixtures behave as before (same branch, identity, and initial commit).
- [ ] `initBareRemoteAndCheckout` and `initRepoWithRemote` still produce equivalent repos (bare remote + pushed `main`).
- [ ] E2e `createE2eProject` keeps `userEmail: 'e2e@t.com'` where used today.
- [ ] Full `packages/apps/cli` test suite passes.

### `initLocalGitRepo` unit tests

- [ ] With defaults, calls `execGit` with `init -b main`, identity config, and `commit --allow-empty -m "init"` in `cwd`.
- [ ] Honors `branch`, `userEmail`, `userName`, and `initialCommitMessage` overrides.
- [ ] Does not call `remote` or `push` subcommands.

### Line count

- [ ] **Net reduction:** After refactor, lines removed from call sites minus lines added in `main.ts` + `index.ts` + barrel export is **≥ 40 lines** (target ~50–60: 88 lines of blocks → 22 one-liners, minus util body).
- [ ] Measure with `git diff --numstat` on `packages/apps/cli` excluding `utils/initLocalGitRepo/unit.test.ts`.

### Conventions

- [ ] Util layout: `main.ts` + `index.ts`, exported from `utils/index.ts`.
- [ ] Single destructured object argument; `function` declaration per project style.
- [ ] Implemented only after `execGit` is merged; imports `execGit` from `../execGit` (not raw `execSync`).

## Implementation notes

- Land **`execGit` first** (`dependsOn`). Then implement `initLocalGitRepo` as a thin wrapper.
- In test files that will only use `initLocalGitRepo` for git setup, remove the private `function git` **only if** no other git calls remain in that file; otherwise keep `git` (from `execGit`) for subsequent commands like `push`.
- `jsConfigToRunLumpInput/unit.test.ts` uses a one-line shell `git init && …` chain — out of scope unless trivially converted; do not expand scope for a single occurrence.
- Re-export from `testing/index.ts` is **not** required; tests may import from `../../utils` or `../../utils/initLocalGitRepo` per surrounding file style.

## dependsOn

- **`execGit`** — `initLocalGitRepo` must call the shared sync git helper, not duplicate `execSync` wiring.
