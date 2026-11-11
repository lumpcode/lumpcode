# Learnings

## Expected
`directImpl` from `desc.yml`: `setup` and `project-setup` write `.lumpcode/.gitignore` once, through `scaffoldLumpcodeProject`, and stop appending ignore lines to the root `.gitignore`. The body ignores `/local.json`, `/.cache/`, `/worktrees/`, `**/contextStatusRecord.json`, `**/history/`, and `**/transcripts/`, and says the file is written once. `setup` commits that path. This repo commits the same file and drops those product lines from the root `.gitignore`, keeping `.worktrees/`. `project.md` tells an existing project to add the file itself. Do not change `run`, `start`, `lump-plan`, the transcript writer, or the cache writer.

`expect.yml` names that same slice: `LUMPCODE_GITIGNORE_BODY` on the scaffold, the setup allowlist and commit assertion, project-setup tests for the nested body and an unchanged root `.gitignore`, this repo's `.lumpcode/.gitignore`, the root `.gitignore` cleanup, and the `project.md` note. This item has no `requirements.md` or `testPlan.md`.

## Landed
Working tree only. No marker commit yet.

- `packages/apps/cli/src/utils/scaffoldLumpcodeProject/main.ts` writes `LUMPCODE_GITIGNORE_BODY` to `.lumpcode/.gitignore` and fails the scaffold when that write throws. The root append and its line constants are gone (−22/+11; expect −22/+18).
- `packages/apps/cli/src/utils/scaffoldLumpcodeProject/unit.test.ts` expects that body and no root `.gitignore` (−13/+4; expect −12/+10).
- `packages/apps/cli/src/commands/setup/main.ts` adds `.lumpcode/.gitignore` to `COMMIT_ALLOWLIST` (−0/+1).
- `packages/apps/cli/src/commands/setup/testing/general.unit.test.ts` expects that path in the setup commit and not a root `.gitignore` (−0/+2).
- `packages/apps/cli/src/commands/project-setup/unit.test.ts` asserts the nested body, leaves a pre-seeded root `.gitignore` unchanged, and drops the duplicate-line cases (−42/+14; expect −50/+28).
- `.lumpcode/.gitignore` is that same 8-line body.
- `.gitignore` drops the product lines, including both `.lumpcode/.cache/` entries, and keeps `.worktrees/` (−7/+0; expect −6/+0).
- `packages/apps/cli/DOCS/config/project.md` names `.lumpcode/.gitignore` in what to commit, and says an existing project adds that file itself while `run` and `start` do not (−1/+5; expect −1/+4).
- `learnings.md` (this file).

`npm run build -w=@lumpcode/cli` and `npm run test -w=@lumpcode/cli` passed (1211 tests).

## Gap
`packages/apps/cli/src/e2e/ts-config-scenarios.test.ts` is not in `expect.yml`. TS-S10 still read the root `.gitignore` for `.lumpcode/.cache/`. It now reads `.lumpcode/.gitignore` for `/.cache/` (−2/+2). `run`, `start`, `lump-plan`, the transcript writer, and the cache writer are unchanged.
