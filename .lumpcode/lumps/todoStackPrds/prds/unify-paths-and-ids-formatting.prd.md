# PRD: Unify paths and IDs formatting

| Field | Value |
| --- | --- |
| **Backlog** | `priority` / `small` |
| **Status** | Pending implementation |
| **Packages** | `packages/apps/cli` (primary), `packages/core` (minimal — commit-message grep alignment only) |

## Problem statement and motivation

Lumpcode derives many filesystem paths, daemon filenames, git branch names, and marker commit subjects from user-supplied identifiers (`projectName`, `lumpName`, `context.name`, command module names). Today those strings are built in **many call sites** via ad hoc `` `${LUMP_BRANCH_PREFIX}${lumpName}/…` `` and `path.join(…, '.lumpcode', 'lumps', lumpName, …)` patterns.

A **subset** of this surface already has dedicated helpers (`getProjectName`, `getGitCommitMessage`, `getCommandPath`, `lumpWorktreePath`, `contextStatusRecordPath`, `getExecutionWorkspacePath`, `resolveDaemonPaths`). The rest is duplicated across commands, utils, and tests. That leads to:

- **Drift risk** — changing a path layout (e.g. history file location) requires a wide, error-prone search.
- **Inconsistent validation** — `projectName` is validated on read; `lumpName` is only validated in `lump-create`; `context.name` is passed through to branches and commit subjects without a shared ruleset.
- **Harder review** — reviewers cannot tell whether a new `path.join` matches existing conventions without reading multiple files.

This task centralizes **formatting** (constructing canonical strings/paths from validated inputs) and **validation** (rejecting unsafe or ambiguous identifiers at boundaries), without changing user-visible CLI behavior or the on-disk layout users already rely on.

### Scope constraint: refactor formatting only, not logic

This is a **mechanical refactor** — replace ad hoc `path.join`, template strings, and duplicated string assembly with calls to canonical formatters. **Application logic must not change:** same control flow, validation rules, error messages, branch naming algorithm, git/daemon behavior, and outputs for the same inputs. **Existing test logic must not change:** same scenarios, assertions, and expected behavior; do not add/remove/reorder cases or change what is under test. The only new test code is **unit tests for the new formatter/validator helpers** themselves.

Production and test files may import formatters instead of inlining paths, but that swap must be behavior-preserving — if a test previously asserted an inline literal, it may call the formatter for the same expected value, not a different one.

## Goals

1. **Single source of truth** for every recurring Lumpcode-derived path and identifier format listed in [Canonical formatters](#canonical-formatters).
2. **Replace inline construction** in `packages/apps/cli` production code (and inline path literals in tests where they duplicate formatter output) with calls to those formatters — without altering logic.
3. **Shared validation** for `projectName` and `lumpName` at CLI boundaries; document rules for `context.name` (see open questions).
4. **Preserve existing behavior** — same paths on disk, same branch naming algorithm, same CLI commit subject format (`LUMP: <lumpName> - <contextName>`), same daemon filename pattern.
5. **Barrel-export** new helpers from `packages/apps/cli/src/utils/index.ts` following the one-util-per-directory convention.

## Non-goals

- **Changing application logic** — no new validation at boundaries, no altered branch/hash/commit rules, no command behavior changes beyond swapping inline formatting for formatter calls.
- **Changing existing test logic** — no new scenarios, removed cases, or different assertions; only mechanical import/literal → formatter swaps where they preserve the same expected values. New test files/cases are only for formatter helpers themselves.
- Changing CLI command names, flags, or default workspace/mode behavior.
- Renaming on-disk directories (`project-copies`, `daemons`, `.lumpcode/worktrees/`, etc.).
- Unifying **core** default `gitCommitMessageFn` (`LUMP:${context.name}`) with the **CLI** marker format — they serve different consumers; only ensure CLI uses one helper everywhere it already uses `getGitCommitMessage`.
- Adding `branchFn` to lump config or exposing branch naming as a user knob (CLI-owned default remains).
- Validating or rewriting arbitrary user filesystem paths inside `contextListJson` / `codeBasePaths` (out of scope).
- Publishing formatters from `@lumpcode/core` in this task unless a core-only call site needs the same helper (prefer CLI ownership).

## User stories / use cases

1. **Maintainer** — When moving context history from JSON to YAML (separate backlog item), I change one `lumpHistoryFilePath` helper instead of grep-updating a dozen `path.join` sites.
2. **Contributor** — When adding a command that reads lump state, I import path helpers and know the layout matches `run`, `clean`, and `lump-status`.
3. **Operator** — Daemon PID/log/meta paths for global vs per-lump daemons stay consistent between `start`, `stop`, `daemon-log`, and `listRunningProjectDaemons`.
4. **Operator** — Marker commits and `git grep` queries in `buildContextStatusRecord` / `clean` use the same prefix function so status detection does not miss commits after a refactor.
5. **New project** — `project-setup` and `lump-create` apply the same `projectName` / `lumpName` validation rules as runtime commands.

## Proposed behavior and UX

No new CLI commands or flags. Existing commands keep the same syntax and behavior; internal path/branch/commit construction moves to shared formatters without logic changes.

Relevant commands (unchanged surface):

```bash
lumpcode project-setup [--projectName <name>] [--mode shared|dedicated]
lumpcode lump-create <lumpName> [--config js|json]
lumpcode run --lumpName <lumpName> [--contextName <contextName>]
lumpcode start [--foreground] [--lumpName <lumpName>]
lumpcode clean [--lumpName <lumpName>] [--contextName <contextName>]
lumpcode lump-status [--lumpName <lumpName>] [--silent]
```

### Identifier rules (target)

| Identifier | Allowed characters / shape | Sanitize on infer? | Validate on use? |
| --- | --- | --- | --- |
| `projectName` | `^[a-zA-Z0-9_-]+$`, non-empty | Yes — `sanitizeInferredProjectName` at `project-setup` | Yes — `isValidProjectName` / `getProjectName` |
| `lumpName` | Non-empty, no `/` `\`, no leading/trailing space, not `.` or `..` | No | Yes — shared with `lump-create` today |
| `context.name` | **No change in v1** — pass through as today (may contain `/` for path-like names) | No | Document only; optional future stricter rules |
| Command module name | Resolved as `<name>.js` under `commands/` | No | Implicit via file existence (`getCommandPath`) |

### Canonical formatters

Implement or consolidate the following in `packages/apps/cli/src/utils/` (names illustrative; match repo naming style):

| Formatter | Responsibility | Exists today? |
| --- | --- | --- |
| `localConfigFolderPath({ projectRoot })` | `<projectRoot>/.lumpcode` | Inline everywhere |
| `projectJsonPath({ localConfigFolderPath })` | `…/project.json` | Inline in `getProjectName` |
| `lumpDirPath({ localConfigFolderPath, lumpName })` | `…/lumps/<lumpName>` | Inline in `jsConfigToRunLumpInput`, `getJsConfigFromLumpName`, `lump-create`, etc. |
| `lumpImportBasePath` | Same as lump dir (alias for `importBasePath` in config resolution) | Duplicate of above |
| `lumpHistoryFilePath({ projectRoot, lumpName, contextName })` | `…/lumps/<lumpName>/history/<contextName>.json` | Inline in `jsConfigToRunLumpInput` |
| `contextStatusRecordPath` | `…/lumps/<lumpName>/contextStatusRecord.json` | **Yes** |
| `commandModulePath({ localConfigFolderPath, globalConfigFolderPath, commandName })` | Local then global `commands/<name>.js` | **Yes** (`getCommandPath`) |
| `executionWorkspacePath` | `project-copies/<projectName>` or source root | **Yes** (`getExecutionWorkspacePath`) |
| `projectCopiesRootPath({ globalConfigFolderPath })` | `…/project-copies` | Inline in `runPreflight` |
| `daemonsDirPath({ globalConfigFolderPath })` | `…/daemons` | Inline in `resolveDaemonPaths` |
| `daemonFileBaseName({ projectName, lumpName? })` | `<projectName>` or `<projectName>.<lumpName>` | Inline in `resolveDaemonPaths` |
| `daemonPidPath` / `daemonLogPath` / `daemonMetaPath` | `…/<base>.daemon.{pid,log,meta.json}` | Partially in `resolveDaemonPaths`; regex in `listRunningProjectDaemons` must use same base helper |
| `lumpBranchName({ lumpName, contextList })` | `lump/<lumpName>/<suffix>` with existing single- vs multi-context hash rules | Logic in `makeBranchFn` in `jsConfigToRunLumpInput` |
| `lumpBranchGlob({ lumpName? })` | `lump/<lumpName>/*` or `lump/*` for `git` / `clean` | Inline with `LUMP_BRANCH_PREFIX` |
| `lumpWorktreePath` | `.lumpcode/worktrees/<branch segments>` | **Yes** |
| `lumpCommitMessage` / `lumpCommitPrefix` | `LUMP: <lumpName> - <contextName>` | **Yes** (`getGitCommitMessage`, `getLumpCommitPrefixForLump`) |
| `isValidProjectName` / `sanitizeInferredProjectName` | Validation / inference | **Yes** (`getProjectName`) |
| `assertValidLumpName` / `isValidLumpName` | Validation | **Partial** (`lump-create` only) |

Constants `LUMP_BRANCH_PREFIX` (`lump/`) and `LUMP_COMMIT_PREFIX` (`LUMP: `) remain in `packages/apps/cli/src/consts.ts`; formatters compose them rather than duplicating string literals.

## Technical approach

### Scope: `packages/apps/cli`

1. **Add missing utils** under `packages/apps/cli/src/utils/<name>/` (`main.ts` + `index.ts`), barrel-exported from `utils/index.ts`.
2. **Replace inline formatting at call sites** (logic unchanged) in:
   - `jsConfigToRunLumpInput` — lump dir, history path, `makeBranchFn` → `lumpBranchName`
   - `getJsConfigFromLumpName`, `planLumpFromJsConfig`, `discoverLoadableLumpNames`
   - `resolveDaemonPaths`, `listRunningProjectDaemons`, `runPreflight`
   - Commands: `project-setup`, `lump-create`, `start`, `stop`, `restart`, `daemon-log`, `daemon-status`, `clean`, `lump-status`, `context-status`
   - Any other production file matching `path.join(.*'.lumpcode'` or `` `${LUMP_BRANCH_PREFIX}` `` outside tests
3. **Extract `assertValidLumpName`** from `lump-create/main.ts` into a shared util; use from commands that accept `--lumpName` where validation is missing today (optional in v1: validate only at create + documented boundaries) — move existing rules as-is, do not tighten or relax them.
4. **Keep `resolveDaemonPaths`** as the orchestrator that calls path helpers; ensure `listRunningProjectDaemons` builds PID paths via `daemonPidPath` so the per-lump filename regex stays aligned with `daemonFileBaseName`.
5. **Tests** — Add unit tests per new formatter (mirror `contextStatusRecordPath/unit.test.ts`, `getLumpWorktreePath/unit.test.ts`). Existing tests may replace inline expected paths with formatter calls if the asserted values stay identical; do not change test scenarios, control flow, or behavioral expectations.

### Scope: `packages/core`

- **No formatter package in core** for filesystem layout (worktree/history paths are CLI-only per AGENTS.md).
- If any core test or helper duplicates commit-subject prefix logic, import nothing from CLI; leave core defaults unchanged.

### Docs

- No user-facing doc changes required unless a public doc repeats path literals; optional one-line pointer in maintainer-facing comments only.
- Do **not** document internal util names in `DOCS/` or `COMMANDS.md` (workspace rule: avoid implementation detail in user docs).

### Migration strategy

1. Introduce new helpers with unit tests (formatter behavior matches current inline output).
2. Replace inline `path.join` / template usage file-by-file with formatter calls; run `packages/apps/cli` Vitest suite — all existing tests must pass with unchanged behavioral coverage.
3. Remove dead duplicates (e.g. private `assertValidLumpName` in `lump-create` after extraction).

## Acceptance criteria

- [ ] Every row in [Canonical formatters](#canonical-formatters) marked “Inline” or “Partial” has a dedicated exported function used by all non-test production call sites in `packages/apps/cli`.
- [ ] No new raw `` path.join(…, '.lumpcode', 'lumps', lumpName `` in production code except inside the canonical lump path helper(s).
- [ ] No new raw `` `${LUMP_BRANCH_PREFIX}${lumpName}` `` outside branch-name helpers and `consts.ts`.
- [ ] `listRunningProjectDaemons` per-lump PID discovery uses the same `daemonFileBaseName` / `daemonPidPath` helpers as `resolveDaemonPaths`.
- [ ] `lump-create` and shared `isValidLumpName` (or equivalent) enforce identical lump name rules as before the refactor.
- [ ] **No application logic changes** — same CLI behavior, paths, branch names, commit subjects, daemon paths, and validation outcomes for the same inputs.
- [ ] **No existing test logic changes** — same test cases and behavioral assertions; only mechanical formatter substitutions where applicable. New unit tests cover each new path formatter with at least one example path (absolute and relative where relevant).
- [ ] Full `packages/apps/cli` Vitest suite passes.

## Open questions and risks

| Topic | Question / risk | Recommendation |
| --- | --- | --- |
| `context.name` with `/` | Branch names become `lump/<lump>/<ctx/with/slash>`; worktree dirs mirror segments. Stricter validation could break existing lumps. | v1: document pass-through; do not validate beyond non-empty. |
| Core vs CLI commit format | Core default `LUMP:${context.name}` vs CLI `LUMP: <lumpName> - <contextName>`. | Explicit non-goal; do not merge in this task. |
| `globalConfigFolderPath` | Not formatted here (~/.lumpcode); assumed passed in from entrypoint. | Out of scope unless a helper already exists at CLI bootstrap. |
| Windows paths | `path.join` is correct; branch names use `/` by git convention. | Keep git-facing strings POSIX-style. |
| Rename overlap | Backlog previously listed `verify-id-name-formatting`; this task subsumes it. | TODOSTACK entry renamed to `unify-paths-and-ids-formatting`. |
| Scope creep | Could extend to `@lumpcode/cli-types` or JSON schema patterns for names; could “fix” validation or branch rules while refactoring. | Defer; CLI runtime boundaries only. Do not change logic under the guise of unifying formatters. |

## Related backlog

- `verify-id-name-formatting` — superseded by this item (renamed and expanded).
- `clean-local-remote-option` — separate; may consume `lumpBranchGlob` when implemented.
- `history-yaml-format` — should use `lumpHistoryFilePath` once this lands.
