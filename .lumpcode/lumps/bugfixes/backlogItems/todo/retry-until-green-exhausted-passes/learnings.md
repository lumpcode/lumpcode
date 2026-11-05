# Learnings

## Expected
`desc.yml`: cap `getRecursiveSteps` on the iteration count, always run the real check, set `lumpVariables.__VALIDATION_FAILED__` to true or false, push by default, and add `pushOnValidationFailure: false` to withhold that push. Workflow is `impl` only. No `dependsOn`.

`requirements.md`: the check runs `maxIterations + 1` times at any nesting depth, with no `Loop limit reached` substitute. A green check sets `__VALIDATION_FAILED__` to `false` and stops. A still-red last check sets it to `true`. Default `pushOnValidationFailure` is `true`: the context succeeds, so core commits and pushes, and later steps still run. `false` fails the walk after the flag is set (`stepWalkFailed`, no commit, no push, later steps do not run). Core's push function stays unchanged. `folderSetTaskDoneStep` and the backlog recipes do not read the flag. No `testPlan.md` or `expect.yml`.

## Landed
Working tree only. No marker commit yet.

- `.lumpcode/lumps/bugfixes/backlogItems/todo/retry-until-green-exhausted-passes/requirements.md` and `desc.yml` state that contract.
- `learnings.md` (this file).

No file under `packages/` changed.

## Gap
`packages/recipes/src/kit/getRecursiveSteps.ts` still caps on `stepIndex` depth and, past `maxIterations`, runs `echo "Loop limit reached"` (exit 0). `__VALIDATION_FAILED__` and `pushOnValidationFailure` are not implemented. `DOCS/author/prompts.md` and `DOCS/examples/building-blocks.md` still say a still-red last attempt fails the context and is not pushed.

## Adjustments
A still-red last attempt must not fail the context by default. Failing it drops the branch workspace, so the edits and the check output are lost. Push the branch so that work can be reviewed. `pushOnValidationFailure: false` is the opt-out. Withholding the push reuses core's `stepWalkFailed` path, which also skips the commit. The flag is a boolean on the shared `lumpVariables` object: `true` only when the last real check is still red.
