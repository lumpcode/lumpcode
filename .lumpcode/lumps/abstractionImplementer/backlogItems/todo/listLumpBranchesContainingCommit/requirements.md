# Requirements: `listLumpBranchesContainingCommit` — branches containing a commit util

| Field | Value |
| --- | --- |
| **Backlog** | `listLumpBranchesContainingCommit` (priority 7) |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | `packages/apps/cli` only |

## Problem statement and repeated pattern

Two production modules independently implement the same **“which lump branches contain this commit?”** flow:

1. Run `git branch [--contains | -r --contains] <hash> --format='%(refname:short)'` via `execAsync` (hash is a hex SHA from prior `git log` parsing; no extra quoting needed today).
2. On command failure, treat as empty.
3. Split stdout into trimmed non-empty lines (same shape as `clean`'s private `parseLocalRefs`).
4. Keep only lines that look like lump branches:
   - **Remote listing** (`-r`): keep names starting with `origin/${LUMP_BRANCH_PREFIX}`, then strip the `origin/` prefix so results are short branch names (`lump/...`).
   - **Local listing**: keep names starting with `LUMP_BRANCH_PREFIX` unchanged.

The skeleton is identical; only whether `-r` is passed and how the caller aggregates results (set vs first match) differ.

### Call sites today

| Location | Command | Filter | Result use |
| --- | --- | --- | --- |
| `commands/clean/main.ts` (`discoverByContext`, ~118–137) | `git branch -r --contains` **and** `git branch --contains` per matching hash | `origin/${LUMP_BRANCH_PREFIX}` → strip `origin/`; local `LUMP_BRANCH_PREFIX` | Accumulate into `Set`s |
| `utils/buildContextStatusRecord/main.ts` (~46–58) | `git branch -r --contains` per context commit hash | `origin/${LUMP_BRANCH_PREFIX}` → strip `origin/` | Take **first** matching short name as `branchName` |

`clean` also uses `parseLocalRefs` for `git branch --list` in `discoverLocalBranches`; that path stays in `clean` (out of scope). Remote `ls-remote` listing is covered by backlog `listRemoteHeadBranches` (out of scope).

## Goals

1. Add `packages/apps/cli/src/utils/listLumpBranchesContainingCommit/` with one exported async function that runs the contains query and returns short lump branch names.
2. Refactor `commands/clean/main.ts` (`discoverByContext`) and `utils/buildContextStatusRecord/main.ts` to use the util, preserving empty-on-failure and filter semantics.
3. Achieve **net line reduction** across `packages/apps/cli` (excluding the new util's `unit.test.ts`).
4. Add focused unit tests for the util (remote vs local, empty failure, prefix filter / `origin/` strip).

## Non-goals

- Changing how commits are discovered (`git log` / `parseGitLogHashSubjectLines`); only the per-hash branch listing.
- Listing remote heads via `git ls-remote` (`listRemoteHeadBranches`) or local globs via `git branch --list`.
- Quoting / validating `commitHash` beyond current call-site behavior (hashes come from `parseGitLogHashSubjectLines`).
- Moving the util to `@lumpcode/core`.
- Deduping across hashes inside the util (`clean` keeps its `Set`s; `buildContextStatusRecord` keeps first-match).

## User stories / use cases

1. As a CLI maintainer — I want one place for “lump branches containing commit X” so `clean` and context-status stay aligned when git flags or prefix constants change.
2. As an implementer — I want a small Success-free `string[]` API (empty on git failure) matching how both call sites already ignore command errors for this step.

## Proposed behavior and UX

**Directory:** `packages/apps/cli/src/utils/listLumpBranchesContainingCommit/`

| Export | Contract |
| --- | --- |
| `listLumpBranchesContainingCommit` | See signature below |

```typescript
export async function listLumpBranchesContainingCommit(input: {
    /** Git working directory (project root). */
    cwd: string;
    /** Commit hash previously obtained from git log parsing. */
    commitHash: string;
    /**
     * When `true`, run `git branch -r --contains …` and return short names
     * after stripping a leading `origin/` from matches under `origin/${LUMP_BRANCH_PREFIX}`.
     * When `false` / omitted, run `git branch --contains …` and return names
     * starting with `LUMP_BRANCH_PREFIX`.
     */
    remotes?: boolean;
}): Promise<string[]>;
```

### Semantics

- Build command:
  - `remotes === true`: `` `git branch -r --contains ${commitHash} --format=${shellSingleQuote('%(refname:short)')}` ``
  - otherwise: `` `git branch --contains ${commitHash} --format=${shellSingleQuote('%(refname:short)')}` ``
- Run via `execAsync` with `{ cwd: input.cwd }`.
- If `execAsync` fails, return `[]`.
- Parse stdout: trim, split on `\n`, drop empty lines, trim each line (same as `parseLocalRefs`).
- Filter / map:
  - **Remote:** keep lines starting with `origin/${LUMP_BRANCH_PREFIX}`; map with `.slice('origin/'.length)`.
  - **Local:** keep lines starting with `LUMP_BRANCH_PREFIX`; no rewrite.
- Preserve first-seen order; do not dedupe beyond what a single command's stdout already implies (callers may still `Set`-accumulate across hashes).
- Import `LUMP_BRANCH_PREFIX` from `packages/apps/cli/src/consts.ts` (same constant both call sites use today).

### Caller adaptation

**`buildContextStatusRecord`:**

| Before | After |
| --- | --- |
| `execAsync` + inline split/filter/map → `[0] ?? ''` | `const names = await listLumpBranchesContainingCommit({ cwd: projectRoot, commitHash: hash, remotes: true });` then `branchName: names[0] ?? ''` |

**`clean` `discoverByContext` (per hash):**

| Before | After |
| --- | --- |
| Parallel `execAsync` for `-r` and local + `parseLocalRefs` + prefix loops | `Promise.all` of two util calls (`remotes: true` / default); `for (const b of …) remoteBranchSet.add(b)` / `localBranchSet.add(b)` |

## Technical approach

| Step | Files | Change |
| --- | --- | --- |
| 1 | `utils/listLumpBranchesContainingCommit/{main.ts,index.ts}` | Implement API above |
| 2 | `utils/index.ts` | Barrel-export |
| 3 | `utils/buildContextStatusRecord/main.ts` | Replace inline remote contains listing |
| 4 | `commands/clean/main.ts` | Replace contains listing inside `discoverByContext` only; leave `parseLocalRefs` for `--list` |
| 5 | `utils/listLumpBranchesContainingCommit/unit.test.ts` | Vitest coverage |

## Testing strategy

| Level | Coverage |
| --- | --- |
| Unit | Temp git repo with a commit on `lump/test-lump/ctx` (local and pushed so `-r` sees `origin/lump/...`): remotes true/false return expected short names; unknown hash or failed git → `[]`; non-lump branches excluded |
| Existing | `buildContextStatusRecord/unit.test.ts` and `commands/clean/unit.test.ts` continue to pass without changing asserted branch names / cleanup behavior |

No E2E changes required.

## Docs updates

None (internal util; no CLI flag or schema change).

## Acceptance criteria

### Behavior

- [ ] Remote mode returns short names (`lump/...`) never `origin/lump/...`.
- [ ] Local mode returns only names starting with `LUMP_BRANCH_PREFIX`.
- [ ] Git failure yields `[]` (same soft-fail as today).
- [ ] `buildContextStatusRecord` still picks the first remote lump branch for `branchName` when multiple exist.
- [ ] `clean` `discoverByContext` still unions remote and local lump branches across matching hashes.
- [ ] Existing `buildContextStatusRecord` and `clean` unit tests pass.

### `listLumpBranchesContainingCommit` unit tests

- [ ] `remotes: true` strips `origin/` and filters to lump branches.
- [ ] Default / `remotes: false` lists local lump branches containing the commit.
- [ ] Returns `[]` when the contains command fails or finds no lump branches.

### Line count

- [ ] **Net reduction:** Lines removed from refactored call sites minus lines added in `main.ts`, `index.ts`, and barrel export is **≥ 10 lines** across `packages/apps/cli`, excluding `utils/listLumpBranchesContainingCommit/unit.test.ts`.
- [ ] Measure with `git diff --numstat` on `packages/apps/cli` after the refactor.

### Conventions

- [ ] Util layout: `main.ts` + `index.ts`, exported from `utils/index.ts`.
- [ ] Single destructured object argument.
- [ ] No nested util subdirectories.
