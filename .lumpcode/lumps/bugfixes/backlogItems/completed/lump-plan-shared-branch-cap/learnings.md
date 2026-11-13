# Learnings

## Expected
`desc.yml`: `lump-plan --plan` reports `tooManyOpenBranches` on a shared checkout, where `run` never applies `maximumNumberOfConcurrentBranches`. Make the preview apply the cap only when `run` would, through one shared gate. Workflow is `impl` only. No `dependsOn`.

`requirements.md`: `evaluateTooManyOpenBranchesSkip` takes `mode` and returns `null` for `shared` without counting branches. `runLumpFromJsConfig` passes `localConfig.mode` instead of wrapping the call in its own mode check. `planLumpFromJsConfig` replaces its inline cap check with that gate and maps the result onto `plan.skipped`. Shared `lump-plan --plan` shows the batch `run` would pick. Dedicated still reports `tooManyOpenBranches`. Skip message wording and the `plan.skipped` shape stay. `run` still does not apply the cap in shared mode. Open-branch counting, `disabled`, and the other plan depths stay. Only the gate compares the open-branch count to `maximumNumberOfConcurrentBranches`. Unit test in `planLumpFromJsConfig/unit.test.ts`: shared `local.json`, cap 1, one open lump branch, `plan.skipped` undefined, `plan.contextNames` and `plan.branchName` set. Existing dedicated plan cap cases and run cap / shared-mode cases stay green. `npm run test -w=@lumpcode/cli` is green. No `testPlan.md` or `expect.yml`. This item is not a child ticket, so there is no parent copy.

## Landed
Working tree only. No marker commit yet.

- `packages/apps/cli/src/utils/runLumpFromJsConfig/evaluateTooManyOpenBranchesSkip.ts`: takes `mode`. `shared` returns `null` before `countOpenLumpBranches`.
- `packages/apps/cli/src/utils/runLumpFromJsConfig/main.ts`: calls the gate with `localConfig.mode`. The caller no longer checks `mode !== 'shared'`.
- `packages/apps/cli/src/utils/planLumpFromJsConfig/main.ts`: calls the same gate with the resolved mode. On a skip, `plan.skipped` uses the gate's counts and reason, and keeps the existing plan `reasonDetail` sentence.
- `packages/apps/cli/src/utils/planLumpFromJsConfig/unit.test.ts`: shared mode, cap 1, one open `lump/preview-lump/*` branch on origin. `plan.skipped` is undefined, `contextNames` is `['ctx1']`, `branchName` is `main`.
- `.lumpcode/lumps/bugfixes/backlogItems/todo/lump-plan-shared-branch-cap/learnings.md` (this file).

`npm run test -w=@lumpcode/cli` passed (1292 tests) after `npm run build:bundle -w=@lumpcode/cli`, the same order CI uses.
