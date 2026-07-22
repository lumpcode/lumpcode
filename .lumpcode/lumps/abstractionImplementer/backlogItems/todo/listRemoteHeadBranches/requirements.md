# Requirements: `listRemoteHeadBranches` — remote lump branch discovery util

| Field | Value |
| --- | --- |
| **Backlog** | `listRemoteHeadBranches` (priority 1) |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | `packages/apps/cli` only |

## Problem statement and repeated pattern

Two production modules independently implement the same **remote branch listing** flow:

1. Run `git ls-remote --heads origin <refs/heads/pattern>` via `execAsync` with `shellSingleQuote` on the ref pattern.
2. On command failure, treat as empty (return `[]` / count `0`).
3. Parse each stdout line: split on whitespace, read `parts[1]` as the full ref, require `refs/heads/` prefix, slice to a short branch name.
4. Keep only short names that start with a caller-specific prefix; dedupe while preserving first-seen order.

The skeleton is identical; only the glob pattern, `namePrefix` filter, and whether the caller needs a list vs a count differ.

### Call sites today

| Location | Local helper | Pattern source | `namePrefix` filter | On git failure |
| --- | --- | --- | --- | --- |
| `commands/clean/main.ts` (`parseRefsFromLsRemote`, `discoverRemoteBranches`, ~43–76) | `parseRefsFromLsRemote` + `discoverRemoteBranches` | `` `${REFS_HEADS_PREFIX}${branchPattern}` `` | `LUMP_BRANCH_PREFIX` | `[]` |
| `utils/countOpenLumpBranches/main.ts` (~24–43) | inline loop in `countOpenLumpBranches` | `` `${REFS_HEADS_PREFIX}${branchGlob}` `` where `branchGlob = lumpBranchGlob({ lumpName })` | `branchGlob` with trailing `*` stripped | count `0` |

`clean` also maps results through `parseLocalRefs` for local branches; that path is **out of scope** (local `git branch --list` parsing stays in `clean`).

## Goals

1. Add `packages/apps/cli/src/utils/listRemoteHeadBranches/` with one exported async function that runs `git ls-remote --heads` and returns deduped short branch names.
2. Refactor `commands/clean/main.ts` and `utils/countOpenLumpBranches/main.ts` to import the util, preserving existing behavior (same patterns, prefixes, empty-on-failure semantics).
3. Achieve **net line reduction** across `packages/apps/cli` production code (excluding the new `unit.test.ts`).
4. Add focused unit tests for the parser path and failure handling.

## Non-goals

- Changing timeout, remote name (`origin`), or ref prefix (`refs/heads/`).
- Listing local branches (`git branch --list`) or context-based discovery in `clean` (`discoverByContext`).
- Moving the util to `@lumpcode/core`.
- Replacing e2e `gitHelpers.ts` bare-remote helpers (`show-ref`, `for-each-ref`).

## Proposed util API

**Directory:** `packages/apps/cli/src/utils/listRemoteHeadBranches/`

```typescript
export async function listRemoteHeadBranches(input: {
    /** Git working directory (project root or execution workspace). */
    cwd: string;
    /**
     * Branch glob or prefix *without* `refs/heads/` (e.g. `lump/my-lump/*`).
     * Passed to `git ls-remote --heads origin` after quoting.
     */
    branchPattern: string;
    /**
     * When set, only return short names starting with this prefix (after stripping `refs/heads/`).
     * Omit to return all matching heads from the ls-remote pattern.
     */
    namePrefix?: string;
}): Promise<string[]>;
```

### Semantics

- Build remote ref pattern as `` `refs/heads/${branchPattern}` `` (same as both call sites today).
- Run `` git ls-remote --heads origin ${shellSingleQuote(remoteRefPattern)} `` with `{ cwd }`.
- If `execAsync` fails, return `[]`.
- Parse stdout lines: trim, split on `/\s+/`, require `parts.length >= 2`, read `parts[1]` as ref.
- Skip refs that do not start with `REFS_HEADS_PREFIX` (`refs/heads/` from `consts.ts`).
- Short name = ref sliced after `REFS_HEADS_PREFIX.length`.
- When `namePrefix` is set, skip short names that do not start with it.
- Dedupe with `Set` while preserving first-seen order (same as `parseRefsFromLsRemote`).

### Caller adaptation

**`countOpenLumpBranches`:**

```typescript
const branchGlob = lumpBranchGlob({ lumpName });
const namePrefix = branchGlob.endsWith('*') ? branchGlob.slice(0, -1) : branchGlob;
const branches = await listRemoteHeadBranches({
    cwd: executionWorkspacePath,
    branchPattern: branchGlob,
    namePrefix,
});
return branches.length;
```

**`clean` (`discoverRemoteBranches`):**

```typescript
return listRemoteHeadBranches({
    cwd: projectRoot,
    branchPattern,
    namePrefix: LUMP_BRANCH_PREFIX,
});
```

Remove `parseRefsFromLsRemote` and the private `discoverRemoteBranches` body (replace with a one-line delegate or inline call).

## Affected files

### Add

| File | Purpose |
| --- | --- |
| `packages/apps/cli/src/utils/listRemoteHeadBranches/main.ts` | Implementation |
| `packages/apps/cli/src/utils/listRemoteHeadBranches/index.ts` | Re-export |
| `packages/apps/cli/src/utils/listRemoteHeadBranches/unit.test.ts` | Vitest coverage |

### Modify

| File | Change |
| --- | --- |
| `packages/apps/cli/src/utils/index.ts` | Barrel-export `listRemoteHeadBranches` |
| `packages/apps/cli/src/commands/clean/main.ts` | Remove `parseRefsFromLsRemote`; delegate `discoverRemoteBranches` to util |
| `packages/apps/cli/src/utils/countOpenLumpBranches/main.ts` | Replace inline ls-remote + parse loop with util call |
| `packages/apps/cli/src/utils/countOpenLumpBranches/unit.test.ts` | Adjust only if imports/mocks change; behavior unchanged |

## Acceptance criteria

### Behavior

- [ ] `lumpcode clean` discovers the same remote lump branches as before for glob, lump-scoped, and context-scoped runs.
- [ ] `countOpenLumpBranches` returns the same counts as before for zero, one, and multiple remote heads (including when `origin` is missing or ls-remote fails).
- [ ] Empty stdout, malformed lines, and duplicate refs are handled identically to current `parseRefsFromLsRemote`.

### `listRemoteHeadBranches` unit tests

- [ ] Returns parsed short names from representative ls-remote stdout (hash + ref columns, multiple lines).
- [ ] Filters by `namePrefix` and skips non-matching refs.
- [ ] Dedupes repeated branch names while preserving order.
- [ ] Returns `[]` when `execAsync` reports failure (mock `execAsync` or inject a test double consistent with sibling utils).
- [ ] Ignores lines with fewer than two whitespace-separated fields.

### Line count

- [ ] **Net reduction:** After refactor, total non-test lines removed from `clean/main.ts` and `countOpenLumpBranches/main.ts` minus lines added in `main.ts`, `index.ts`, and barrel export is **≥ 15 lines**.
- [ ] Measure with `git diff --numstat` on `packages/apps/cli`, excluding `utils/listRemoteHeadBranches/unit.test.ts`.

### Conventions

- [ ] Util layout: `main.ts` + `index.ts`, exported from `utils/index.ts`.
- [ ] Single destructured object argument; reuse `execAsync` and `shellSingleQuote` from `@lumpcode/core`, `REFS_HEADS_PREFIX` from `consts.ts`.
- [ ] No nested util subdirectories.

## dependsOn

None.
