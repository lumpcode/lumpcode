# parseGitLogHashSubjectLines

## Repeated pattern

Three modules parsed `git log --format='%H %s'` stdout the same way: split on newlines, trim, split each line on the first space into `{ hash, subject }`, then filter on subject (exact match or prefix).

Call sites:

1. `packages/core/src/helpers/getContextStatus/main.ts` — find commits whose subject equals the lump marker message.
2. `packages/apps/cli/src/utils/buildContextStatusRecord/main.ts` — enumerate contexts from commits whose subject starts with the lump prefix.
3. `packages/apps/cli/src/commands/clean/main.ts` — find commits for a single context when scoping cleanup by `contextName`.

Each copy inlined the same `split` / `trim` / `indexOf(' ')` / `slice` pipeline (~12 lines).

## Why this name

`parseGitLogHashSubjectLines` names the input shape (`git log` lines with `%H %s` format) and the output (an array of hash/subject pairs). It matches sibling core parsers/utilities (`readJsonFile`, `formatExecFailureMessage`) and stays agnostic of lump-specific filtering (callers still apply exact or prefix subject checks).

## Files changed

**Added (core)**

- `packages/core/src/utils/parseGitLogHashSubjectLines/main.ts`
- `packages/core/src/utils/parseGitLogHashSubjectLines/index.ts`
- `packages/core/src/utils/parseGitLogHashSubjectLines/unit.test.ts`
- `packages/core/src/utils/index.ts` (barrel export)

**Refactored**

- `packages/core/src/helpers/getContextStatus/main.ts`
- `packages/apps/cli/src/utils/buildContextStatusRecord/main.ts`
- `packages/apps/cli/src/commands/clean/main.ts`

## Line count (approximate)

| | Lines |
|---|---|
| Removed from call sites (duplicate parse loops) | ~36 |
| Added util (`main.ts` + `index.ts` + barrel) | ~21 |
| Added at refactored call sites (imports + util calls) | ~10 |
| **Net reduction (excluding `unit.test.ts`)** | **~5** |

(From `git diff --numstat` on modified files plus `wc -l` on the new util sources.)
