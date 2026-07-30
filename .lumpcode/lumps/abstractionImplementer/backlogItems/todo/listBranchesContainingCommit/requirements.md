# Requirements: `listBranchesContainingCommit` — branches containing a commit util

| Field | Value |
| --- | --- |
| **Backlog** | `listBranchesContainingCommit` · priority **7** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | `packages/apps/cli` only |

## Problem statement and motivation

Two production modules independently implement the same **list branches that contain a commit** flow:

1. Run `git branch [-r] --contains <hash> --format='%(refname:short)'` via `execAsync` with `shellSingleQuote` on the format string (hash is hex from git log, unquoted today).
2. On command failure, treat as empty (no branches / empty `branchName`).
3. Split stdout into trimmed non-empty lines.
4. For remote (`-r`) results: keep lines starting with `origin/<prefix>`, strip the `origin/` prefix to get a short branch name.
5. For local results: keep lines starting with `<prefix>` as-is.

The skeleton is identical; only whether `-r` is used, how many matching branches are kept (all vs first), and how the caller aggregates results differ.

### Call sites today

| Location | Scope | Filter | Result use |
| --- | --- | --- | --- |
| `commands/clean/main.ts` (`discoverByContext`, ~92–110) | remote (`-r`) and local, in parallel per hash | `origin/${LUMP_BRANCH_PREFIX}` then strip `origin/`; local `LUMP_BRANCH_PREFIX` | accumulate into `Set`s across hashes |
| `utils/buildContextStatusRecord/main.ts` (~46–58) | remote (`-r`) only | `origin/${LUMP_BRANCH_PREFIX}` then strip `origin/` | take first match as `branchName` (else `''`) |

`clean` also defines module-local `parseLocalRefs` used by this path and by `discoverLocalBranches` (`git branch --list`); the `--list` path stays in `clean`.

## Goals

1. Add `packages/apps/cli/src/utils/listBranchesContainingCommit/` with one exported async function that runs `git branch [--contains]` and returns short branch names (remote scope already stripped of `origin/`).
2. Refactor **both** call sites above to use the util, preserving empty-on-failure, filter semantics, and outward behavior (`clean` discovery sets; `buildContextStatusRecord` first-match `branchName`).
3. Achieve **net line reduction** across `packages/apps/cli` (production code), excluding the new util’s `unit.test.ts`.
4. Add focused unit tests for remote/local scope, filter, empty-on-failure, and `origin/` stripping.

## Non-goals

- Changing `git log` / `parseGitLogHashSubjectLines` discovery of which commits to query.
- Listing heads via `git ls-remote` (`listRemoteHeadBranches`) or local `git branch --list` glob discovery in `clean`.
- Moving the util to `@lumpcode/core`.
- Quoting/validating `commitHash` beyond what call sites do today (hashes come from git log).
- Deduping across multiple hashes (callers that loop hashes keep their own `Set`s).

## User stories / use cases

1. As a CLI maintainer — I want one util for “which branches contain this commit”, so `clean` and context-status stay consistent when parsing git stdout.
2. As an implementer — I want remote vs local scope and an optional short-name filter as explicit inputs, so callers do not re-copy `origin/` strip logic.

## Proposed behavior and UX

**Directory:** `packages/apps/cli/src/utils/listBranchesContainingCommit/`

| Export | Contract |
| --- | --- |
| `listBranchesContainingCommit` | async function; object input; returns `Promise<string[]>` |

```typescript
export async function listBranchesContainingCommit(input: {
    /** Git working directory (project root or execution workspace). */
    cwd: string;
    /** Commit hash (from `git log` / `parseGitLogHashSubjectLines`). */
    commitHash: string;
    /**
     * `remote` → `git branch -r --contains` and strip a leading `origin/` from each short name.
     * `local` → `git branch --contains` and return short names as printed.
     */
    scope: 'remote' | 'local';
    /** When set, keep only short names for which this returns true (after `origin/` strip for remote). */
    postFilterBranchShortName?: (shortName: string) => boolean;
}): Promise<string[]>;
```

### Semantics

- Build command:
  - remote: `` `git branch -r --contains ${commitHash} --format=${shellSingleQuote('%(refname:short)')}` ``
  - local: `` `git branch --contains ${commitHash} --format=${shellSingleQuote('%(refname:short)')}` ``
- Run via `execAsync` with `{ cwd: input.cwd }`.
- If `execAsync` fails, return `[]`.
- Parse stdout: trim, split on `\n`, drop empty lines, trim each line (same as `parseLocalRefs` for this path).
- When `scope === 'remote'`: for each line starting with `origin/`, yield `line.slice('origin/'.length)`; skip lines that do not start with `origin/`.
- When `scope === 'local'`: yield each line as-is.
- When `postFilterBranchShortName` is set, skip short names for which it returns false.
- Preserve first-seen order; do not dedupe inside the util (git output is typically unique; callers that need cross-hash dedupe use their own `Set`).

### Caller adaptation

**`buildContextStatusRecord`:**

| Step | Contract |
| --- | --- |
| Replace inline `execAsync` + stdout map/filter | `const branches = await listBranchesContainingCommit({ cwd: projectRoot, commitHash: hash, scope: 'remote', postFilterBranchShortName: (n) => n.startsWith(LUMP_BRANCH_PREFIX) })` |
| `branchName` | `branches[0] ?? ''` |

**`clean` (`discoverByContext` loop body):**

| Step | Contract |
| --- | --- |
| Parallel remote + local | `Promise.all` of two `listBranchesContainingCommit` calls (`scope: 'remote'` / `'local'`, both filter `n.startsWith(LUMP_BRANCH_PREFIX)`) |
| Accumulate | add each returned name into existing `remoteBranchSet` / `localBranchSet` |

`parseLocalRefs` may remain for `discoverLocalBranches` only.

Barrel-export from `packages/apps/cli/src/utils/index.ts`.

## Technical approach

| Step | Area | Change |
| --- | --- | --- |
| 1 | `utils/listBranchesContainingCommit/` | Add `main.ts`, `index.ts` implementing the API above |
| 2 | `utils/index.ts` | Barrel-export the new util |
| 3 | `utils/buildContextStatusRecord/main.ts` | Replace `--contains` + parse block with util; drop unused imports if any |
| 4 | `commands/clean/main.ts` | Replace `--contains` remote/local parse blocks in `discoverByContext` with util |
| 5 | `utils/listBranchesContainingCommit/unit.test.ts` | Cover semantics below |

No CLI flags, schemas, or user-facing docs.

## Testing strategy

| Level | What |
| --- | --- |
| Unit (`listBranchesContainingCommit/unit.test.ts`) | Mock or stub `execAsync`: success remote stdout with `origin/lump/...` lines → stripped short names; local stdout → as-is; `postFilterBranchShortName` drops non-matches; `execAsync` failure → `[]`; remote lines without `origin/` prefix skipped |
| Unit (existing) | `buildContextStatusRecord/unit.test.ts` and `commands/clean/unit.test.ts` keep passing without behavior changes (update imports only if needed) |
| Integration / E2E | None required for this util extraction |

## Docs updates

None. Internal util only.

## Acceptance criteria

1. `packages/apps/cli/src/utils/listBranchesContainingCommit/` exists with `main.ts`, `index.ts`, and `unit.test.ts`, barrel-exported from `utils/index.ts`.
2. `listBranchesContainingCommit` matches the API and semantics above (`scope`, optional `postFilterBranchShortName`, `[]` on git failure, `origin/` strip for remote).
3. `commands/clean/main.ts` `discoverByContext` and `utils/buildContextStatusRecord/main.ts` no longer inline `git branch … --contains` + stdout parsing for this pattern.
4. Existing `clean` and `buildContextStatusRecord` behaviors are preserved (same filters, empty-on-failure, first remote match for status `branchName`).
5. Net line count in `packages/apps/cli` decreases after the refactor, **excluding** the new `unit.test.ts`.
6. New unit tests cover remote/local scope, filter, failure → `[]`, and remote `origin/` stripping.
