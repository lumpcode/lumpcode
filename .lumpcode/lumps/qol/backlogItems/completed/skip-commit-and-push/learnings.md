# Learnings

## Expected
`desc.yml` (`directImpl`, no `dependsOn`): a lump can set `skipCommitAndPush` so a dedicated run still does its work in the branch workspace and does not commit or push `lump/…`.

`requirements.md`: optional boolean on `LumpJsConfig` and `lumpConfig.schema.json`, `@lumpcode/cli` only. Omit and `false` keep the dedicated commit and push. `true` uses `makeSharedNoopGitFns` for dedicated as well as shared, with or without a git lock. `jsConfigToRunLumpInput` strips the field before it is copied onto `RunLumpInput`. `makeGatedGitFns` stays the publishing path. Shared mode, workspace setup and teardown, `branchFn`, `gitCommitMessageFn`, context status, and `project.json` / `local.json` stay as they are. Docs: a row on `config/lump.md` linking to `start/run.md`; step 6 names the field; the dedicated cell in `start/terms.md`; one sentence on `lumpcode run`. Unit tests in `jsConfigToRunLumpInput/testing/general.unit.test.ts` and `validateLumpJsonConfig/unit.test.ts`. No E2E. No `testPlan.md`.

`expect.yml`: those nine files. Estimates: `LumpJsConfig.ts` +8, `jsConfigToRunLumpInput/main.ts` −4/+12, `general.unit.test.ts` +90, `validateLumpJsonConfig/unit.test.ts` +30, `lumpConfig.schema.json` +6, `lump.md` −1/+6, `run.md` −2/+5, `terms.md` −1/+2, `commands.md` −1/+2.

## Landed
Working tree only. No marker commit yet.

- `packages/apps/cli/src/types/LumpJsConfig.ts` adds optional `skipCommitAndPush` (+6).
- `packages/apps/cli/src/utils/jsConfigToRunLumpInput/main.ts` strips the field and selects `makeSharedNoopGitFns` when the mode is shared or the field is `true`, including when a git lock is set. Omit and `false` still spread `makeGatedGitFns` only when a lock is present (−2/+6).
- `packages/apps/cli/src/utils/jsConfigToRunLumpInput/testing/general.unit.test.ts`: dedicated `true` returns `success(undefined)` and leaves the git log on `init`, with and without a lock; `false` matches omit (no functions without a lock, a real commit with a lock); shared `true` stays a no-op; the key is absent on `RunLumpInput`. Workspace setup still emits the dedicated `git switch -c` (−1/+157).
- `packages/apps/cli/src/utils/validateLumpJsonConfig/unit.test.ts`: `true` and `false` validate, a non-boolean fails, omit still validates (+21).
- `packages/apps/cli/src/schemas/lumpConfig.schema.json`: optional boolean (+5).
- `packages/apps/cli/DOCS/config/lump.md` (+1), `DOCS/start/run.md` (+3), `DOCS/start/terms.md` (−1/+1), `DOCS/reference/commands.md` (−1/+1).
- `packages/apps/cli/src/utils/countOpenLumpBranches/unit.test.ts` (−4/+5), `planLumpFromJsConfig/unit.test.ts` (+1), and `runLumpFromJsConfig/unit.test.ts` (−1/+2) call `createLumpWorkBranch`, `execGit`, and `LUMP_BRANCH_PREFIX`. Those names were referenced and not defined, so the CLI suite failed before this wiring.
- `learnings.md` (this file).

`makeGatedGitFns`, `project.json`, and `local.json` are unchanged. Every file in `expect.yml` is in the diff. `npm run build -w=@lumpcode/cli && npm run test -w=@lumpcode/cli` passed (1282 tests).

## Gap
`expect.yml` does not name the three unit files above. They are in the diff so the package test command can finish.
