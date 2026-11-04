# Requirements: `primaryBranches` glob expansion uses a different dialect than lump matching

| Field | Value |
| --- | --- |
| **Backlog** | `primary-branches-glob-nested-scan` · priority **30** · type **fix** |
| **Status** | Pending implementation |
| **Depends on** | — |
| **Packages** | Primary `@lumpcode/cli` (`expandPrimaryBranches`). `@lumpcode/core` and `@lumpcode/recipes` unchanged. |

## Problem statement and motivation

A dedicated worker expands `local.json` `primaryBranches` globs into concrete scan branches in [`packages/apps/cli/src/utils/expandPrimaryBranches/main.ts`](../../../../../../packages/apps/cli/src/utils/expandPrimaryBranches/main.ts). It takes every head returned by `git ls-remote --heads origin 'refs/heads/<glob>'`. Git's ls-remote matcher lets `*` (and `?`) cross `/`, so `feature/*` returns `feature/x/y`.

Every other consumer of the same glob uses [`branchMatchesGitGlob`](../../../../../../packages/apps/cli/src/utils/branchMatchesGitGlob/main.ts), whose documented contract is segment-only `*` ("`feature/*` matches `feature/a`, not `feature/a/b`"): lump discovery matching (`discoveryRulesMatchScanBranch` in `resolveLumpBranches`) and the dedicated allowlist (`isDiscoveryBranchAllowedByPrimaries`). The two dialects disagree:

1. A nested head such as `feature/x/y` is added to the scan list, so each tick runs discovery preflight (fetch, switch, reset) and `refreshCommand` on it.
2. No lump can match it. A lump pushed on `feature/x/y` with `discoveryBranches: ['dev', 'feature/*']` is silently never run there.
3. `--discoveryBranch feature/x/y` is rejected by the allowlist, although the worker scans that branch.

### Repro (run during bug hunt, scratch test against a real bare remote)

1. Remote heads: `main`, `feature/a`, `feature/x/y`.
2. `expandPrimaryBranches({ localConfig: { mode: 'dedicated', workspaceStrategy: 'checkout', primaryBranches: ['main', 'feature/*'] }, cwd })`.
3. Check each result with `discoveryRulesMatchScanBranch({ rules: ['main', 'feature/*'], scanBranch })`.

| | Result |
| --- | --- |
| **Actual** | Scan list `['main', 'feature/a', 'feature/x/y']`; `feature/x/y` does not match the same rules. |
| **Expected** | Scan list `['main', 'feature/a']`. Every expanded branch matches the `primaryBranches` glob it came from under `branchMatchesGitGlob`. |

The existing `expandPrimaryBranches` unit tests mock `listRemoteHeadBranches`, so they never see git's own matching.

## Goals

1. A `primaryBranches` glob expands only to heads that `branchMatchesGitGlob` accepts for that glob.
2. The scan list, lump discovery matching, and the allowlist agree on one glob dialect (segment-only `*` and `?`).

## Non-goals

- Changing `branchMatchesGitGlob` semantics, or making `*` cross `/` in matching.
- Supporting `[...]` character classes.
- Changing `clean`, `lumpBranchGlob`, or open-branch counting.

## User stories / use cases

1. As an operator with `primaryBranches: ["dev", "feature/*"]`, nested branches such as `feature/team/x` are not scanned on every tick for lumps that can never match them.
2. As an operator with `primaryBranches: ["main", "feature/*/*"]`, a two-segment head such as `feature/x/y` is scanned, and a lump whose discovery rules are `feature/*/*` matches it. A deeper head such as `feature/x/y/z` is not scanned.
3. As an operator, the branches `daemon-status` and the logs show being scanned are the same branches I can pass to `--discoveryBranch`.

## Proposed behavior and UX

No CLI or config shape changes. `expandPrimaryBranches(input) → Success<string[]> | Failure<string>` keeps its order contract (configured-entry order, resolved primary first) and its timeout and no-match behavior. A glob whose ls-remote hits are all filtered out follows the existing "matched no remote heads; skipping" path.

## Technical approach

| Step | File | Change |
| --- | --- | --- |
| 1 | `packages/apps/cli/src/utils/expandPrimaryBranches/main.ts` | Pass `postFilterBranchShortName` to `listRemoteHeadBranches` so only heads for which `branchMatchesGitGlob({ pattern: entry, branch })` is true are kept. |

`branchMatchesGitGlob` is the single owner of glob semantics for branch names. Do not add a second matcher or rewrite the ls-remote pattern.

## Testing strategy

| Level | Test | Covers |
| --- | --- | --- |
| Unit (real git fixture, no mock) | `packages/apps/cli/src/utils/expandPrimaryBranches/unit.test.ts`: remote heads `main`, `feature/a`, `feature/x/y`; `primaryBranches: ['main', 'feature/*']` | Result is `['main', 'feature/a']`. |
| Unit (real git fixture, no mock) | Same file: remote heads `main`, `feature/x/y`, `feature/x/y/z`; `primaryBranches: ['main', 'feature/*/*']` | Result includes `feature/x/y` and omits `feature/x/y/z`. `discoveryRulesMatchScanBranch({ rules: ['feature/*/*'], scanBranch: 'feature/x/y' })` is true. |
| Unit | existing X* tests in the same file | Still pass unchanged. |

## Acceptance criteria

1. The repro returns `['main', 'feature/a']`.
2. Each branch in the expanded list satisfies `discoveryRulesMatchScanBranch` for the same `primaryBranches` rules.
3. `primaryBranches: ['main', 'feature/*/*']` expands to include `feature/x/y` and omit `feature/x/y/z`, and `feature/x/y` satisfies `discoveryRulesMatchScanBranch` for rules `['feature/*/*']`.
4. `npm run test -w=@lumpcode/cli` is green.
