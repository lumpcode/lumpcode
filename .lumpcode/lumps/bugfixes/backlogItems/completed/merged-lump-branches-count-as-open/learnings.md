# Learnings

## Expected
`desc.yml`: `maximumNumberOfConcurrentBranches` counts every `lump/<lumpName>/*` ref on origin, so a branch already merged into a non-lump branch keeps blocking the lump until someone deletes it. Stop counting a branch whose tip is reachable from a non-lump origin head, in both `run` and `lump-plan`.

`requirements.md`: A remote lump branch is merged when its `ls-remote` tip is contained in a local `refs/remotes/origin/` ref whose branch name does not start with `lump/` (`origin/HEAD` included). A missing tip, a git error, or a squash or rebase merge still counts. `ls-remote` failure still returns 0. `countOpenLumpBranches` keeps its signature and applies `listRemoteHeadRefs` plus `isReachableFromNonLumpRemoteHead`. `isNonLumpRemoteTrackingRef` replaces `clean`'s private predicate with the same behavior. Skip shapes stay the same. Docs in `lump.md`, `worker.md`, and `troubleshooting.md` state the rule and the squash/rebase exception. No `testPlan.md` or `expect.yml`.

## Landed
Working tree only. No marker commit yet.

- `packages/apps/cli/src/utils/listRemoteHeadBranches/main.ts`: `listRemoteHeadRefs` keeps the `ls-remote` hash; `listRemoteHeadBranches` returns those names. `index.ts` already re-exports `./main`.
- `packages/apps/cli/src/utils/isReachableFromNonLumpRemoteHead/` (`main.ts`, `index.ts`, `unit.test.ts`): `git for-each-ref --contains` on `refs/remotes/origin`, plus `isNonLumpRemoteTrackingRef`. Git failure returns false. Never throws.
- `packages/apps/cli/src/utils/countOpenLumpBranches/main.ts`: counts remote lump heads for which that check is false. The doc comment states the merged rule.
- `packages/apps/cli/src/utils/index.ts`: barrel-exports the new util.
- `packages/apps/cli/src/commands/clean/main.ts`: imports `isNonLumpRemoteTrackingRef`.
- Tests cover hashes from `ls-remote`; reachability after a merge into `origin/main` or `origin/dev`, an unmerged commit, an `origin/lump` tip, an unknown hash, and a git failure; counts for a merge commit, a fast-forward, one merged plus one open, a squash merge, and a tip pushed from a second clone and not fetched; dedicated `runLumpFromJsConfig` with cap 1 starts when the only origin lump branch is merged; `planLumpFromJsConfig` depth `plan` returns a plan. Existing `clean` tests stayed green.
- `packages/apps/cli/DOCS/config/lump.md`, `packages/apps/cli/DOCS/start/worker.md`, `packages/apps/cli/DOCS/reference/troubleshooting.md`.
- `learnings.md` (this file).

`npm run test -w=@lumpcode/cli` passed (1261 tests).
