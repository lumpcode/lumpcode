# Learnings

## Expected
`desc.yml`: `clean --lumpName <L> --contextName <X>` deletes every `lump/*` branch whose history contains X's marker, including after that commit is on the base. Scope `discoverByContext` in `commands/clean/main.ts` to `lump/<L>/*` branches that carry the marker on unmerged commits.

`requirements.md`: delete a branch only when its short name starts with `lump/<L>/` and some commit reachable from it, but not from a non-`lump/` remote-tracking head, matches `LUMP: <L> - <X>`. A marker already on the base deletes nothing through `--contextName`. Leave `clean` without `--contextName`, the marker format, and `deleteRefs` as they are. Docs: `--contextName` deletes `lump/<lumpName>/*` branches whose unmerged commits carry that marker. Tests: `lump/otherLump/card` and same-lump `form`, both cut from `main` after `button` merges, survive; existing contextName assertions stay. No `testPlan.md` or `expect.yml`.

## Landed
Working tree only. No marker commit yet.

- `packages/apps/cli/src/commands/clean/main.ts`: `discoverByContext` keeps candidates under `lumpBranchGlob({ lumpName })` (`lump/<L>/`) and skips a marker commit that `git branch -r --contains` shows on a remote-tracking head outside `lump/`.
- `packages/apps/cli/src/commands/clean/unit.test.ts`: after `button` merges into `main`, `lump/otherLump/card` and `lump/myLump/form` stay locally and on the remote and are absent from `deletedBranches`. An unmerged `button` commit that `lump/otherLump/card` also contains still deletes `button` and leaves `card`. Existing assertions unchanged.
- `packages/apps/cli/DOCS/reference/commands.md`: `--contextName` deletes `lump/<lumpName>/*` branches whose unmerged commits carry that marker.
- `learnings.md` (this file).

`npm run test -w=@lumpcode/cli` passed (1226 tests).
