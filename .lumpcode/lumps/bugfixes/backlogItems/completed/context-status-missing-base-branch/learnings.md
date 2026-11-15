# Learnings

## Expected

`desc.yml` asks `context-status`, including `--setToFinished`, to resolve an omitted lump `baseBranch` through one `resolveInspectBaseBranch` util shared with `lump-status` (lump `baseBranch`, else concrete discovery, else `primaryBranch`) and to accept `--discoveryBranch` the way `lump-status` does.

`requirements.md` puts that util in `packages/apps/cli/src/utils/resolveInspectBaseBranch`, has both commands call it, keeps the non-string or empty `baseBranch` failure, removes `is missing baseBranch in its config`, documents `--discoveryBranch` and the marker's base branch on `context-status`, and requires the new unit cases plus `npm run build -w=@lumpcode/cli` and `npm run test -w=@lumpcode/cli`. This item has no `testPlan.md` or `expect.yml`.

## Landed

Working tree only. The marker commit for this stage does not exist yet.

- `packages/apps/cli/src/utils/resolveInspectBaseBranch/main.ts`
- `packages/apps/cli/src/utils/resolveInspectBaseBranch/index.ts`
- `packages/apps/cli/src/utils/resolveInspectBaseBranch/unit.test.ts`
- `packages/apps/cli/src/utils/index.ts`
- `packages/apps/cli/src/commands/lump-status/main.ts`
- `packages/apps/cli/src/commands/context-status/main.ts`
- `packages/apps/cli/src/commands/context-status/unit.test.ts`
- `packages/apps/cli/DOCS/reference/commands.md`
- `.lumpcode/lumps/bugfixes/backlogItems/todo/context-status-missing-base-branch/learnings.md`

The util composes `resolveEffectiveDiscoveryBranch` (`honorDiscoveryBranchOptInShared: true`) and `resolveLumpBaseBranch`. `lump-status` and `context-status` call it and import neither of those two helpers. A non-string or blank `baseBranch` still fails with the concrete-branch message. An omitted one resolves the same way `lump-status` does, including `--discoveryBranch`. `npm run build -w=@lumpcode/cli` and `npm run test -w=@lumpcode/cli` passed (173 files, 1348 tests).
