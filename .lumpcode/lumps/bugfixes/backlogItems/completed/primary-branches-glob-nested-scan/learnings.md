# Learnings

## Expected
`desc.yml`: `expandPrimaryBranches` trusts `git ls-remote`, whose `*` crosses `/`, so `primaryBranches` `feature/*` adds nested heads such as `feature/x/y` while `branchMatchesGitGlob` (discovery matching and the `--discoveryBranch` allowlist) rejects them. Filter expanded heads through `branchMatchesGitGlob` so both use one dialect. Workflow: `impl`. No `dependsOn`.

`requirements.md`: in `packages/apps/cli` only, pass `postFilterBranchShortName` into `listRemoteHeadBranches` and keep a head only when `branchMatchesGitGlob({ pattern: entry, branch })` is true. Do not add a second matcher, rewrite the ls-remote pattern, or change `branchMatchesGitGlob`, `[...]` classes, `clean`, `lumpBranchGlob`, or open-branch counting. Order, timeout, and the "matched no remote heads; skipping" path stay. Real git fixtures: `feature/*` yields `['main', 'feature/a']` and drops `feature/x/y`; `feature/*/*` includes `feature/x/y`, omits `feature/x/y/z`, and that head matches `discoveryRulesMatchScanBranch`. Existing X* tests stay. No `testPlan.md` or `expect.yml`.

## Landed
Working tree only. No marker commit yet.

- `packages/apps/cli/src/utils/expandPrimaryBranches/main.ts`: glob expansion passes `postFilterBranchShortName` so `branchMatchesGitGlob` drops heads git's `*` kept across `/`. An empty post-filter result still takes the existing skip path.
- `packages/apps/cli/src/utils/expandPrimaryBranches/unit.test.ts`: real remotes cover both fixtures. `feature/x/y` and `feature/x/y/z` are published in packed-refs, because a loose ref cannot be a path prefix of another. Each expanded branch matches `discoveryRulesMatchScanBranch` for the same `primaryBranches`. X* cases unchanged.
- `learnings.md` (this file).

`npm run build -w=@lumpcode/cli` and `npm run test -w=@lumpcode/cli` passed (1231 tests).
