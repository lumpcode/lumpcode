# PRD: `execGit` — synchronous git subprocess util

| Field | Value |
| --- | --- |
| **Backlog** | `execGit` (priority 3) |
| **Status** | Pending implementation |
| **Package** | `packages/apps/cli` only |

## Problem statement and repeated pattern

Dozens of CLI modules independently define the same **synchronous git helper**:

```typescript
function git(cmd: string, cwd: string) {
    execSync(`git ${cmd}`, { cwd, stdio: 'pipe' });
}
```

or the stdout-returning variant:

```typescript
function gitOutput(cmd: string, cwd: string): string {
    return execSync(`git ${cmd}`, { cwd, stdio: 'pipe' }).toString().trim();
}
```

The skeleton is identical: prefix `git ` to a subcommand string, run `execSync` with `stdio: 'pipe'` in a working directory, optionally return trimmed stdout. Call sites only differ by local function name (`git`, `gitOutput`, `gitExec`) and whether the return value is used.

This duplication drifts encoding (`utf-8` vs default buffer + `.toString()`), makes fixture refactors error-prone, and hides the single canonical way to run git in tests and the e2e harness.

### Call sites today

| Location | Local name | Returns stdout |
| --- | --- | --- |
| `e2e/harness/gitHelpers.ts` (`git`) | `git` | yes |
| `testing/multiBranchFixtures.ts` (`gitExec`) | `gitExec` | yes |
| `utils/setContextToFinishedStatus/unit.test.ts` | `git` + `gitOutput` | both |
| `utils/runProjectPreflight/unit.test.ts` | `git` | no |
| `utils/runPreflight/unit.test.ts` | `git` | no |
| `utils/runLumpFromLumpName/unit.test.ts` | `git` | no |
| `utils/runLumpFromJsConfig/unit.test.ts` | `git` | no |
| `utils/planLumpFromJsConfig/unit.test.ts` | `git` | no |
| `utils/makeLumpWorkspaceFns/unit.test.ts` | `git` | no |
| `utils/countOpenLumpBranches/unit.test.ts` | `git` | no |
| `utils/buildContextStatusRecord/unit.test.ts` | `git` | no |
| `commands/stop/unit.test.ts` | `git` | no |
| `commands/start/unit.test.ts` | `git` | no |
| `commands/restart/unit.test.ts` | `git` | no |
| `commands/project-setup/unit.test.ts` | `git` | no |
| `commands/lump-status/unit.test.ts` | `git` | no |
| `commands/lump-plan/unit.test.ts` | `git` | no |
| `commands/lump-create/unit.test.ts` | `git` | no |
| `commands/daemon-status/unit.test.ts` | `git` | no |
| `commands/daemon-log/unit.test.ts` | `git` | no |
| `commands/context-status/unit.test.ts` | `git` | no |
| `commands/clean/unit.test.ts` | `git` + `gitOutput` | both |

**22** private helper definitions across the package (20 `function git`, 2 extra `gitOutput`, plus `gitExec` in `multiBranchFixtures` and exported `git` in `gitHelpers`).

Some tests still call `execSync('git …')` inline (e.g. `validateDaemonLaunch/unit.test.ts`, `discoverDedicatedLumpsForScanBranch/unit.test.ts`); migrate those to `execGit` when touching the same blocks during refactor, but they are not required for acceptance if unchanged behavior is preserved.

## Goals

1. Add `packages/apps/cli/src/utils/execGit/` with one exported function for sync git execution.
2. Refactor **all** helper definitions listed above to import `execGit` (use `import { execGit as git }` where renaming every call site is noisy).
3. Make `e2e/harness/gitHelpers.ts` delegate to `execGit` so e2e and unit tests share one implementation.
4. Achieve **net line reduction** across `packages/apps/cli` (excluding the new util's `unit.test.ts`).
5. Add focused unit tests for `execGit`.

## Non-goals

- Replacing production `execAsync` git usage in command handlers and engine utils (`clean`, `runPreflight`, `buildContextStatusRecord`, etc.).
- Async git wrappers or streaming output.
- Moving the util to `@lumpcode/core`.
- Shell-quoting helpers for user-controlled ref names (callers keep embedding literals or use existing `shellSingleQuote` at `execAsync` call sites).
- A separate `testing/` copy of the helper; this util is the single source of truth (barrel-exported from `utils/` per abstraction backlog convention).

## Proposed util API

**Directory:** `packages/apps/cli/src/utils/execGit/`

```typescript
import { execSync } from 'node:child_process';

/**
 * Run `git <cmd>` synchronously in `cwd` and return trimmed stdout.
 * Throws when git exits non-zero (same as `execSync`).
 */
export function execGit(cmd: string, cwd: string): string {
    return execSync(`git ${cmd}`, { cwd, stdio: 'pipe', encoding: 'utf-8' }).trim();
}
```

### Semantics

- `cmd` is the subcommand fragment after `git ` (e.g. `'init -b main'`, `'commit --allow-empty -m "init"'`). Do not include the `git` binary name.
- Uses `encoding: 'utf-8'` and `.trim()` on stdout for stable string comparisons in tests.
- Non-zero git exit propagates as an thrown error from `execSync` (callers that expect failure use `expect(() => execGit(...)).toThrow()` or try/catch).
- Return value may be ignored when callers only need side effects (replaces void `git()` helpers).

### Caller adaptation

**Void local helper removal** (most unit tests):

```typescript
import { execGit as git } from '../../utils/execGit';
// delete local function git(...)
// existing git('init -b main', projectRoot) calls unchanged
```

**Stdout helpers** (`gitOutput`, `gitHelpers.git`, `gitExec`):

```typescript
import { execGit } from '../execGit';
const branch = execGit('rev-parse --abbrev-ref HEAD', projectRoot);
```

**`gitHelpers.ts`** (keep e2e import path stable):

```typescript
export { execGit as git } from '../../utils/execGit';
```

## Affected files

### Add

| File | Purpose |
| --- | --- |
| `packages/apps/cli/src/utils/execGit/main.ts` | Implementation |
| `packages/apps/cli/src/utils/execGit/index.ts` | Re-export |
| `packages/apps/cli/src/utils/execGit/unit.test.ts` | Vitest coverage |

### Modify

| File | Change |
| --- | --- |
| `packages/apps/cli/src/utils/index.ts` | Barrel-export `execGit` |
| `packages/apps/cli/src/e2e/harness/gitHelpers.ts` | Re-export `execGit as git`; remove local body |
| `packages/apps/cli/src/testing/multiBranchFixtures.ts` | Replace private `gitExec` with `execGit` |
| All 20 unit test files listed in the call-site table | Remove local `git` / `gitOutput`; import `execGit` |

## Acceptance criteria

### Behavior

- [ ] All existing unit and e2e tests pass without changing git fixture semantics (branch names, commit messages, remotes).
- [ ] `gitHelpers` consumers (`createE2eProject`, marker assertions, etc.) behave identically via re-exported `git`.
- [ ] `initBareRemoteAndCheckout` and other `testing/` fixtures behave identically after `gitExec` removal.

### `execGit` unit tests

- [ ] Returns trimmed stdout for a simple read-only command (e.g. `rev-parse --is-inside-work-tree` in a temp repo).
- [ ] Throws when git exits non-zero (e.g. invalid subcommand or missing repo).
- [ ] Uses the provided `cwd` (command run in target directory, not process cwd).

### Line count

- [ ] **Net reduction:** After refactor, total lines removed from duplicate helpers and redundant `execSync` imports minus lines added in `main.ts` + `index.ts` + barrel export is **≥ 40 lines**.
- [ ] Measure with `git diff --numstat` on `packages/apps/cli` excluding `utils/execGit/unit.test.ts`.

### Conventions

- [ ] Util layout matches CLI convention: `main.ts` + `index.ts`, exported from `utils/index.ts`.
- [ ] Function uses a direct declaration with two positional parameters (simple enough not to require a destructured options object).
- [ ] No new nested util subdirectories.

## Implementation notes

- Prefer `import { execGit as git } from '…/execGit'` (or from the `../../utils` barrel when the file already imports other utils) to minimize call-site churn.
- Remove unused `execSync` imports from refactored test files.
- `clean/unit.test.ts` and `setContextToFinishedStatus/unit.test.ts`: delete both `git` and `gitOutput`; use `execGit` for calls that needed stdout.
- Do not change production command `main.ts` files unless they contain duplicate helpers (none today).

## dependsOn

None. No existing backlog or DONE util is a prerequisite.
