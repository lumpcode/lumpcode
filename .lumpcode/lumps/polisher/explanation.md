# Say which baseBranch value was rejected and why

A lump's `baseBranch` must be an exact branch name. `jsConfigToRunLumpInput` (`packages/apps/cli/src/utils/jsConfigToRunLumpInput/main.ts`) rejects a pattern such as `feature/*`, and also rejects a `baseBranch` function that returns a pattern, an empty string, or a non-string. The errors did not show the rejected value or that the problem was a pattern:

```
baseBranch must be a concrete branch name
baseBranch function must return a non-empty concrete branch name
```

The sibling check for `--discoveryBranch` already says `not a pattern (got "...")`. That matters most for the function form, where the operator never typed the value. The messages now match that wording and show what was rejected:

```
baseBranch must be a concrete branch name, not a pattern (got "feature/*")
baseBranch function must return a non-empty concrete branch name, not a pattern (got "exec/*")
```

A non-string return shows its type instead (`got undefined`). The inline function and the file-path module function had the same three-line check, so both now call one private helper, `checkBaseBranchFnResult`. The same inputs still fail at the same point; only the text changed. No docs or memory quoted the old strings. `context-status` has its own `baseBranch` message, which I left alone.

Tests: in `testing/dynamicDiscoveryBranch.unit.test.ts`, B3 now expects the new string. A new B3b covers a `baseBranch` function that returns a pattern.

Checks: `npm run test -w=@lumpcode/cli` (167 files, 1286 tests pass) and root `npm run build` (passes). One earlier full-suite run failed `sparseCronCatchUp.unit.test.ts` on a timing-based retry test. It passed 3 of 3 runs alone and on the next full run. It does not touch this code.
