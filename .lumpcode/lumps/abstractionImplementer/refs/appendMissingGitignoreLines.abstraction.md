# appendMissingGitignoreLines

## Repeated pattern

Three CLI code paths needed to ensure specific lines exist in the repository `.gitignore` without duplicating entries:

1. `commands/project-setup/main.ts` — `ensureGitignoreLines` read `.gitignore`, built a trimmed-line `Set`, filtered to missing lines, and `appendFile` with a newline prefix when needed.
2. `utils/transpileTypeScriptToCachedMjs/main.ts` — `ensureCacheGitignored` repeated the same read / set / missing-check / append shape for `.lumpcode/.cache/`.
3. `testing/multiBranchFixtures.ts` — `writeLocalJson` inlined the same append-only-missing-lines logic for `.lumpcode/local.json`.

All three: read existing `.gitignore` (treat missing file as empty), compare trimmed lines, append only what is absent.

## Why this name

`appendMissingGitignoreLines` states the operation: append to `.gitignore`, only lines that are not already present. It is generic enough for `@lumpcode/core` and matches how callers use it (`projectRoot` plus one or more ignore patterns).

## Files changed

**Added (core)**

- `packages/core/src/utils/appendMissingGitignoreLines/main.ts`
- `packages/core/src/utils/appendMissingGitignoreLines/index.ts`
- `packages/core/src/utils/appendMissingGitignoreLines/unit.test.ts`
- `packages/core/src/utils/index.ts` (barrel export)

**Refactored (cli)**

- `packages/apps/cli/src/commands/project-setup/main.ts` — removed local `ensureGitignoreLines`
- `packages/apps/cli/src/utils/transpileTypeScriptToCachedMjs/main.ts` — removed `ensureCacheGitignored`
- `packages/apps/cli/src/testing/multiBranchFixtures.ts` — `writeLocalJson` calls core util

## Line count (approximate)

| | Lines |
|---|---|
| Removed from CLI (duplicate gitignore logic) | ~56 |
| Added util + tests + barrel | ~51 |
| **Net reduction** | **~5** |

(Counts from `git diff --stat` on modified CLI files plus `wc -l` on the new util directory.)
